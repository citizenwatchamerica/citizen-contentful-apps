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
      // Multivalue
      if (!selected?.length) {
        // Empty array, Initial Value
        setSelected([id]);
        setSelectedItemsInfo([findSearchResultData(id)]);
        recordSite(id, true);
      } else {
        // Array exists, modify it

        const updateSelected = [...selected];
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

  const searchBarProps = {
    isLoading: queryIsFetching,
    query: query,
    onQueryChange: onQueryChange,
    onSave: onSave,
    stickyHeaderBreakpoint: stickyHeaderBreakpoint,
    saveIsDisabled: !selected?.length,
    selectedItems: selected,
    selectedData: selectedData,
    removeSelected: onItemSelect,
    siteIds: siteIds,
    selectedSiteId: selectedSiteId,
    onSiteChange: onSiteChange,
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
