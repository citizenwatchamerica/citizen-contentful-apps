import React, { useState } from 'react';
import { css } from '@emotion/react';

import {
  Flex,
  Box,
  /* Text, */ TextInput,
  Spinner,
  Button,
  Tooltip,
  Grid,
  Text,
} from '@contentful/f36-components';
import { SearchIcon, CloseIcon, ErrorCircleIcon, AssetIcon, TagsIcon } from '@contentful/f36-icons';
import tokens from '@contentful/f36-tokens';
import { useSDK } from '@contentful/react-apps-toolkit';
import { DialogAppSDK } from '@contentful/app-sdk';

import { DialogInvocationParameters } from '../../locations/Dialog';

interface SearchBarProps {
  query: string;
  isLoading: boolean;
  stickyHeaderBreakpoint: number;
  saveIsDisabled: boolean;
  selectedItems?: string | string[];
  selectedData: any[];
  onQueryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  removeSelected: (id: string) => void;
  // Fixed by the field's locale; shown so the editor knows which site results come from.
  siteId: string;
  selectionLimitMessage?: string;
  showSaveButton?: boolean;
}

interface SearchControlProps extends SearchBarProps {
  fieldType: 'product' | 'category';
}

const SearchBar = (props: SearchBarProps) => {
  const sdk = useSDK<DialogAppSDK>();
  const { fieldType } = sdk.parameters.invocation as DialogInvocationParameters;

  const headerStyles = css`
    padding: ${tokens.spacingM} ${tokens.spacingL};
    background-color: white;
    border-bottom: 1px solid ${tokens.gray200};
    position: sticky;
    top: 0;
    z-index: 1;
  `;

  const controlProps = { ...props, fieldType };
  const hasSelection = getSelectedIds(props.selectedItems).length > 0;

  // Two rows: what is being searched (site, query) and Save on the first; what is
  // already picked on the second, only once there is something to show.
  return (
    <Box as="header" css={headerStyles}>
      <Flex alignItems="center" gap="spacingM">
        <Text fontColor="gray700" css={{ flexShrink: 0 }}>
          Site:{' '}
          <Text as="span" fontWeight="fontWeightDemiBold">
            {props.siteId}
          </Text>
        </Text>
        <LeftSideControls {...controlProps} />
        {props.showSaveButton !== false && (
          <Button
            variant="primary"
            onClick={props.onSave}
            isDisabled={props.saveIsDisabled}
            css={{ marginLeft: 'auto' }}>
            Save
          </Button>
        )}
      </Flex>
      {(hasSelection || props.selectionLimitMessage) && <SelectionRow {...controlProps} />}
    </Box>
  );
};

const getSelectedIds = (items?: string | string[]): string[] =>
  !items ? [] : typeof items === 'string' ? [items] : items;

const LeftSideControls = (props: SearchControlProps) => {
  const wrapperStyles = css`
    position: relative;
    z-index: 0;
  `;

  const textInputStyles = css`
    padding-left: 35px;
  `;

  const searchIconStyles = css`
    z-index: 1;
    position: absolute;
    top: 10px;
    left: 10px;
  `;

  // const countTextStyles = css`
  //   font-size: ${tokens.fontSizeS};
  //   color: ${tokens.gray600};
  //   display: block;
  //   margin-top: ${tokens.spacingS};
  // `

  return (
    <Box css={wrapperStyles}>
      <Flex flexDirection="row" alignItems="center">
        <TextInput
          placeholder={`Search for a ${props.fieldType}...`}
          type="search"
          name="item-search"
          id="item-search"
          css={textInputStyles}
          onChange={props.onQueryChange}
          value={props.query}
        />
        <SearchIcon variant="muted" css={searchIconStyles} />
        {props.isLoading && (
          <Box marginLeft="spacingS">
            <Spinner />
          </Box>
        )}
      </Flex>
      {/* <Text css={countTextStyles}>Total results: </Text> */}
    </Box>
  );
};

const SelectionRow = (props: SearchControlProps) => (
  <Box marginTop="spacingS">
    <SelectionList
      items={props.selectedItems}
      itemsInfo={props.selectedData}
      removeSelected={props.removeSelected}
      fieldType={props.fieldType}
    />
    {props.selectionLimitMessage && (
      <Text
        as="p"
        fontSize="fontSizeS"
        css={css`
          color: ${tokens.colorWarning};
          margin-top: ${tokens.spacingXs};
          margin-bottom: 0;
        `}>
        {props.selectionLimitMessage}
      </Text>
    )}
  </Box>
);

interface SelectionListProps {
  items?: string | string[];
  itemsInfo: any[];
  removeSelected: (item: string) => void;
  fieldType: 'product' | 'category';
}

const SelectionList = (props: SelectionListProps) => (
  <Flex gap="spacingXs" flexWrap="wrap" alignItems="center">
    {getSelectedIds(props.items).map((itemId: string) => (
      <SelectionListItem
        key={itemId}
        itemId={itemId}
        itemData={props.itemsInfo.find((item) => item?.id === itemId)}
        removeSelected={props.removeSelected}
        fieldType={props.fieldType}
      />
    ))}
  </Flex>
);

interface SelectionListItemProps {
  itemId: string;
  itemData: any;
  fieldType: 'product' | 'category';
  removeSelected: (id: string) => void;
}

const chipSize = '40px';

const chipStyles = css`
  position: relative;
  width: ${chipSize};
  height: ${chipSize};
  padding: 0;
  overflow: hidden;
  border: 1px solid ${tokens.gray200};
  border-radius: ${tokens.borderRadiusSmall};
  background-color: ${tokens.gray100};
  cursor: pointer;
  transition: border-color ${tokens.transitionDurationDefault} ${tokens.transitionEasingDefault};
  &:hover,
  &:focus-visible {
    border-color: ${tokens.gray500};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.glowPrimary};
  }
  &:hover > [data-remove],
  &:focus-visible > [data-remove] {
    opacity: 1;
  }
`;

// Each layer fills the chip, so the image covers the placeholder instead of
// stacking beneath it.
const fillStyles = css`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const placeholderStyles = css`
  ${fillStyles};
  & svg {
    fill: ${tokens.gray600};
  }
`;

const imageStyles = css`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const removeStyles = css`
  ${fillStyles};
  background-color: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity ${tokens.transitionDurationDefault} ${tokens.transitionEasingDefault};
`;

const SelectionListItem = (props: SelectionListItemProps) => {
  const { itemId, itemData, fieldType } = props;

  const [imageHasLoaded, setImageHasLoaded] = useState<boolean>(false);
  const [imageHasErrored, setImageHasErrored] = useState<boolean>(false);

  const imageUrl = fieldType === 'product' ? itemData?.image?.absUrl : undefined;
  const showImage = Boolean(imageUrl) && !imageHasErrored;
  const PlaceholderIcon = !itemData
    ? ErrorCircleIcon
    : fieldType === 'product'
    ? AssetIcon
    : TagsIcon;

  return (
    <Tooltip content={itemId} placement="bottom">
      <button
        type="button"
        aria-label={`Remove ${itemId}`}
        onClick={() => props.removeSelected(itemId)}
        css={chipStyles}>
        {!(showImage && imageHasLoaded) && (
          <span css={placeholderStyles}>
            <PlaceholderIcon />
          </span>
        )}
        {showImage && (
          <img
            alt=""
            src={imageUrl}
            onLoad={() => setImageHasLoaded(true)}
            onError={() => setImageHasErrored(true)}
            css={imageStyles}
            style={{ visibility: imageHasLoaded ? 'visible' : 'hidden' }}
          />
        )}
        <span data-remove css={removeStyles}>
          <CloseIcon variant="white" />
        </span>
      </button>
    </Tooltip>
  );
};

export default SearchBar;
