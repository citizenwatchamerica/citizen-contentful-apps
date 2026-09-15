import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { AppInstallationParameters, parseSiteIds } from '../locations/ConfigScreen';

// Handles legacy composite keys ("catalogId:categoryId") by extracting just the category ID.
// New format stores only the category ID, so this is a no-op for new values.
export const parseCategoryId = (id: string): string =>
  id.includes(':') ? id.split(':').pop()! : id;

const proxyUrl = import.meta.env.VITE_PROXY_URL || 'https://thawing-shore-22303.herokuapp.com/';

interface SFCCAdminToken {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface TokenProps {
  tokenInfo: SFCCAdminToken;
  expiry: Date;
}

class SfccClient {
  protected client!: AxiosInstance;
  protected parameters: AppInstallationParameters;
  protected siteId: string;

  constructor(parameters: AppInstallationParameters, siteId: string) {
    this.parameters = parameters;
    this.siteId = siteId;

    this.client = axios.create({
      baseURL: proxyUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(this.interceptor, (error) => Promise.reject(error));
  }

  private interceptor = (config: InternalAxiosRequestConfig) => {
    // Add basic proxy parameters to our URL
    config.url = `/sfcc/${this.parameters.shortCode}` + config.url;

    // Fetch access token and add to configuration
    return this.useAccessToken(config);
  };

  private fetchAccessToken = async () => {
    const authToken = window.btoa(`${this.parameters.clientId}:${this.parameters.clientSecret}`);
    const tenantId = this.parameters.organizationId.split('_').slice(2).join('_');
    const now = new Date();

    const { data } = await axios.post(
      'https://account.demandware.com/dwsso/oauth2/access_token',
      {
        grant_type: 'client_credentials',
        scope: `SALESFORCE_COMMERCE_API:${tenantId} sfcc.catalogs sfcc.products`,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authToken}`,
        },
      }
    );

    return {
      tokenInfo: data,
      expiry: new Date(now.getTime() + data.expires_in * 1000),
    };
  };

  private useAccessToken = async (config: InternalAxiosRequestConfig) => {
    const now = new Date();

    const storageToken = localStorage.getItem('sfcc-token');

    let accessToken;
    if (!storageToken) {
      accessToken = await this.fetchAccessToken();
      localStorage.setItem('sfcc-token', JSON.stringify(accessToken));
    } else {
      accessToken = JSON.parse(storageToken) as TokenProps;
      const expiry = new Date(accessToken.expiry);

      if (now >= expiry) {
        accessToken = await this.fetchAccessToken();
        localStorage.setItem('sfcc-token', JSON.stringify(accessToken));
      }
    }

    config.headers.set('Authorization', `Bearer ${accessToken.tokenInfo.access_token}`);
    return config;
  };

  fetchProduct = async (productId: string) => {
    const { data: product } = await this.client.get(
      `/product/products/v1/organizations/${this.parameters.organizationId}/products/${productId}`,
      {
        params: { siteId: this.siteId },
      }
    );

    return product;
  };

  searchProducts = async (query?: string) => {
    const { organizationId } = this.parameters;

    const data: any = {
      query: {
        boolQuery: {
          must: [
            {
              termQuery: {
                fields: ['type'],
                operator: 'one_of',
                values: ['bundle','item','master','option','retailSet','set','variant','variationGroup'],
              },
            },
          ],
        },
      },
      sorts: [
        {
          field: 'name',
          sortOrder: 'asc',
        },
      ],
    };

    if (query?.length) {
      data.query.boolQuery.must.push({
        textQuery: {
          fields: ['id', 'name'],
          searchPhrase: query,
        },
      });
    }

    const { data: searchResults } = await this.client.post(
      `/product/products/v1/organizations/${organizationId}/product-search`,
      data,
      {
        params: { siteId: this.siteId },
      }
    );

    return searchResults.hits?.length ? searchResults.hits : [];
  };

  private fetchCatalogs = async (): Promise<any[]> => {
    const cacheKey = 'sfcc-catalogs';
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    try {
      const { data: result } = await this.client.get(
        `/product/catalogs/v1/organizations/${this.parameters.organizationId}/catalogs`
      );

      const catalogs = result.data || [];
      sessionStorage.setItem(cacheKey, JSON.stringify(catalogs));
      return catalogs;
    } catch {
      return [];
    }
  };

  public fetchCatalogIdForSite = async (siteId: string): Promise<string | null> => {
    const catalogs = await this.fetchCatalogs();
    const catalog = catalogs.find((cat: any) =>
      cat.assignedSites?.some((site: any) => site.id === siteId)
    );

    return catalog?.id || null;
  };

  public fetchSiteCatalogId = async (): Promise<string | null> =>
    this.fetchCatalogIdForSite(this.siteId);

  // Every catalog serving any configured site. A saved category may have been
  // selected under any of them, so looking one up cannot assume a single site.
  public fetchConfiguredCatalogIds = async (): Promise<string[]> => {
    const catalogs = await this.fetchCatalogs();
    const siteIds = parseSiteIds(this.parameters.siteIds);

    return catalogs
      .filter((cat: any) => cat.assignedSites?.some((site: any) => siteIds.includes(site.id)))
      .map((cat: any) => cat.id)
      .filter(Boolean);
  };

  // The configured sites a catalog serves: one where a site has its own catalog,
  // several where sites still share one.
  public fetchSitesForCatalog = async (catalogId: string): Promise<string[]> => {
    const catalogs = await this.fetchCatalogs();
    const siteIds = parseSiteIds(this.parameters.siteIds);
    const catalog = catalogs.find((cat: any) => cat.id === catalogId);

    return (catalog?.assignedSites || [])
      .map((site: any) => site.id)
      .filter((id: string) => siteIds.includes(id));
  };

  private buildCategoryQuery = (catalogIds: string[], query?: string) => {
    const must: any[] = [
      {
        termQuery: {
          fields: ['online'],
          operator: 'is',
          values: [true],
        },
      },
    ];

    if (catalogIds.length) {
      must.push({
        termQuery: {
          fields: ['catalogId'],
          operator: 'one_of',
          values: catalogIds,
        },
      });
    }

    if (query?.length) {
      must.push({
        textQuery: {
          fields: ['id', 'name'],
          searchPhrase: query,
        },
      });
    }

    return {
      query: { boolQuery: { must } },
      sorts: [{ field: 'name', sortOrder: 'asc' }],
    };
  };

  public searchCategories = async (query?: string) => {
    const { organizationId } = this.parameters;
    const catalogId = await this.fetchSiteCatalogId();

    const data = this.buildCategoryQuery(catalogId ? [catalogId] : [], query);

    const { data: searchResults } = await this.client.post(
      `/product/catalogs/v1/organizations/${organizationId}/category-search`,
      data
    );

    return searchResults.hits?.length ? searchResults.hits : [];
  };

  private searchCategoryInCatalogs = async (categoryId: string, catalogIds: string[]) => {
    const { organizationId } = this.parameters;

    const data = this.buildCategoryQuery(catalogIds);
    data.query.boolQuery.must.push({
      termQuery: {
        fields: ['id'],
        operator: 'is',
        values: [categoryId],
      },
    });

    const { data: searchResults } = await this.client.post(
      `/product/catalogs/v1/organizations/${organizationId}/category-search`,
      data
    );

    return searchResults.hits?.[0] || null;
  };

  // Category IDs are only unique within a catalog, so the same ID can sit in
  // several of them. When the site a category was selected under is known, look
  // it up in that site's catalog first — searching every catalog would return an
  // arbitrary copy, whose catalog then reports the wrong sites. Falls back to a
  // catalog-wide search so a category that has since moved is still found.
  public fetchCategoryById = async (categoryId: string, preferredSiteId?: string) => {
    if (preferredSiteId) {
      const catalogId = await this.fetchCatalogIdForSite(preferredSiteId);

      if (catalogId) {
        const scopedHit = await this.searchCategoryInCatalogs(categoryId, [catalogId]);
        if (scopedHit) return scopedHit;
      }
    }

    const catalogIds = await this.fetchConfiguredCatalogIds();
    return this.searchCategoryInCatalogs(categoryId, catalogIds);
  };
}

export default SfccClient;
