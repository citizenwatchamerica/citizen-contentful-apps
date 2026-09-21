import React, { useState, useEffect } from 'react';

// Contentful Imports
import { Modal } from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { DialogAppSDK } from '@contentful/app-sdk';

// Local Imports
import SfccClient from '../../utils/Sfcc';
import SearchBar from './SearchBar';
import ProductSearchResults from './ProductSearchResults';
import CategorySearchResults from './CategorySearchResults';
import { AppInstallationParameters } from '../../locations/ConfigScreen';
import { DialogInvocationParameters } from '../../locations/Dialog';
import { SiteMap, pruneSiteMap } from '../../utils/siteMap';

export const headerHeight = 114;
export const stickyHeaderBreakpoint = 900;
export const height = window.outerHeight - window.outerHeight * 0.3 - headerHeight;
export const MAX_PRODUCT_SELECTION = 24;

export const getSelectedItems = (selected: string | string[] | undefined) => {
  if (!selected) return [];
  return typeof selected === 'string' ? [selected] : selected;
};

export const canAddSelectedProduct = (
  fieldType: 'product' | 'category',
  selectMultiple: boolean,
  selected: string | string[] | undefined,
  id: string,
) => {
  if (fieldType !== 'product' || !selectMultiple) {
    return true;
  }

  const selectedItems = getSelectedItems(selected);
  if (selectedItems.includes(id)) {
    return true;
  }

  return selectedItems.length < MAX_PRODUCT_SELECTION;
};

export const hasReachedProductLimit = (
  fieldType: 'product' | 'category',
  selectMultiple: boolean,
  selected: string | string[] | undefined,
) => {
  if (fieldType !== 'product' || !selectMultiple) {
    return false;
  }

  return getSelectedItems(selected).length >= MAX_PRODUCT_SELECTION;
};

export const getProductSelectionLimitMessage = (
  fieldType: 'product' | 'category',
  selectMultiple: boolean,
  selected: string | string[] | undefined,
) => {
  if (!hasReachedProductLimit(fieldType, selectMultiple, selected)) {
    return undefined;
  }

  return `The storefront cannot display more than ${MAX_PRODUCT_SELECTION} selected products at once. Remove one before adding another.`;
};

const SearchPicker = () => {
  const sdk = useSDK<DialogAppSDK>();
  const installParameters = sdk.parameters.installation as AppInstallationParameters;
  const { selectMultiple, fieldType, fieldValue, currentData, siteIds, siteMap } = sdk.parameters
    .invocation as DialogInvocationParameters;

  const [selectedSiteId, setSelectedSiteId] = useState<string>(siteIds[0]);
  const [query, setQuery] = useState<string>('');
  const [queryIsFetching, setQueryIsFetching] = useState<boolean>(false);
  const [selected, setSelected] = useState<string | string[] | undefined>(fieldValue);
  const [selectedData, setSelectedItemsInfo] = useState<any[]>(currentData || []);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [siteById, setSiteById] = useState<SiteMap>(siteMap || {});

  const onSiteChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSiteId(event.target.value);
    setSearchResults([]);
  };

  const onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const onSave = () => {
    const selectedIds = typeof selected === 'string' ? [selected] : selected || [];
    sdk.close({ value: selected, siteMap: pruneSiteMap(siteById, selectedIds) });
  };

  // Which site was active when each item was picked. The site cannot be worked
  // out later where sites share a catalog, so it is recorded at selection time.
  const recordSite = (id: string, isSelected: boolean) => {
    setSiteById((current) => {
      const next = { ...current };
      isSelected ? (next[id] = selectedSiteId) : delete next[id];
      return next;
    });
  };

  const findSearchResultData = (id: string) => {
    return searchResults.find((item) => item.id === id);
  };

  const onItemSelect = (id: string) => {
    if (selectMultiple) {
      const selectedItems = getSelectedItems(selected);
      const alreadySelected = selectedItems.includes(id);

      if (!alreadySelected && !canAddSelectedProduct(fieldType, selectMultiple, selected, id)) {
        return;
      }

      // Multivalue
      if (!selected?.length) {
        // Empty array, Initial Value
        setSelected([id]);
        setSelectedItemsInfo([findSearchResultData(id)]);
        recordSite(id, true);
      } else {
        // Array exists, modify it

        const updateSelected = [...selectedItems];
        let updateSelectedData = [];
        const includedIndex = updateSelected.findIndex((item) => item === id);
        if (includedIndex > -1) {
          // Item exists in array, unset it
          updateSelected.splice(includedIndex, 1);
          updateSelectedData = selectedData.filter((item) => item.id !== id);
          recordSite(id, false);
        } else {
          updateSelected.push(id);
          updateSelectedData = [...selectedData, findSearchResultData(id)];
          recordSite(id, true);
        }

        setSelected(updateSelected);
        setSelectedItemsInfo(updateSelectedData);
      }
    } else {
      // Single value
      if (selected === id) {
        setSelected('');
        setSelectedItemsInfo([]);
        setSiteById({});
      } else {
        setSelected(id);
        setSelectedItemsInfo([findSearchResultData(id)]);
        setSiteById({ [id]: selectedSiteId });
      }
    }
  };

  useEffect(() => {
    const timeOutId = setTimeout(() => {
      const client = new SfccClient(installParameters, selectedSiteId);
      const fetchResults =
        fieldType === 'product' ? client.searchProducts : client.searchCategories;
      if (query.length >= 3) {
        setQueryIsFetching(true);
        fetchResults(query)
          .then((results: any[]) => setSearchResults(results))
          .finally(() => setQueryIsFetching(false));
      } else {
        setQueryIsFetching(true);
        fetchResults()
          .then((results: any[]) => setSearchResults(results))
          .finally(() => setQueryIsFetching(false));
      }
    }, 500);
    return () => clearTimeout(timeOutId);
  }, [fieldType, query, installParameters, selectedSiteId]);

  const selectionLimitMessage = getProductSelectionLimitMessage(
    fieldType,
    Boolean(selectMultiple),
    selected,
  );

  const selectedItemCount = getSelectedItems(selected).length;

  const searchBarProps = {
    isLoading: queryIsFetching,
    query: query,
    onQueryChange: onQueryChange,
    onSave: onSave,
    stickyHeaderBreakpoint: stickyHeaderBreakpoint,
    saveIsDisabled: selectedItemCount > MAX_PRODUCT_SELECTION || !selectedItemCount,
    selectedItems: selected,
    selectedData: selectedData,
    removeSelected: onItemSelect,
    siteIds: siteIds,
    selectedSiteId: selectedSiteId,
    onSiteChange: onSiteChange,
    selectionLimitMessage,
    showSaveButton: selectedItemCount < MAX_PRODUCT_SELECTION + 1,
  };

  const SearchResultsComponent =
    fieldType === 'product' ? ProductSearchResults : CategorySearchResults;

  return (
    <Modal.Content>
      <SearchBar {...searchBarProps} />
      {searchResults.length > 0 && (
        <SearchResultsComponent
          searchResults={searchResults}
          fieldType={fieldType}
          onItemSelect={onItemSelect}
          selectedItems={selected}
        />
      )}
    </Modal.Content>
  );
};

export interface SearchPickerResult {
  value: string | string[];
  siteMap: SiteMap;
}

export interface SearchResultsProps {
  searchResults: any[];
  fieldType: string;
  onItemSelect: (id: string) => void;
  selectedItems?: string | string[];
}

export interface SearchResultProps {
  result: any;
  fieldType: string;
  selected?: string | string[];
  onItemSelect: (id: string) => void;
}

export default SearchPicker;
