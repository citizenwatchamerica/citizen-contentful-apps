import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { AppInstallationParameters } from '../locations/ConfigScreen';

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

  public fetchSiteCatalogId = async (): Promise<string | null> => {
    const cacheKey = `sfcc-catalog-${this.siteId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;

    try {
      const { data: result } = await this.client.get(
        `/product/catalogs/v1/organizations/${this.parameters.organizationId}/catalogs`
      );

      const catalog = result.data?.find((cat: any) =>
        cat.assignedSites?.some((site: any) => site.id === this.siteId)
      );

      const catalogId = catalog?.id || null;
      if (catalogId) {
        sessionStorage.setItem(cacheKey, catalogId);
      }
      return catalogId;
    } catch {
      return null;
    }
  };

  private buildCategoryQuery = (catalogId: string | null, query?: string) => {
    const must: any[] = [
      {
        termQuery: {
          fields: ['online'],
          operator: 'is',
          values: [true],
        },
      },
    ];

    if (catalogId) {
      must.push({
        termQuery: {
          fields: ['catalogId'],
          operator: 'is',
          values: [catalogId],
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

    const data = this.buildCategoryQuery(catalogId, query);

    const { data: searchResults } = await this.client.post(
      `/product/catalogs/v1/organizations/${organizationId}/category-search`,
      data
    );

    return searchResults.hits?.length ? searchResults.hits : [];
  };

  public fetchCategoryById = async (categoryId: string) => {
    const { organizationId } = this.parameters;
    const catalogId = await this.fetchSiteCatalogId();

    const data = this.buildCategoryQuery(catalogId);
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
}

export default SfccClient;
