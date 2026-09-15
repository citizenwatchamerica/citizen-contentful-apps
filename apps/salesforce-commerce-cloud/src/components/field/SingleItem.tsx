import React from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { FieldAppSDK } from '@contentful/app-sdk';

import { AppInstanceParameters } from '../../locations/Field';
import ItemCard from './ItemCard';
import { SiteMap, readSiteMap, writeSiteMap, removeFromSiteMap } from '../../utils/siteMap';
import { parseCategoryId } from '../../utils/Sfcc';

interface SingleItemProps {
  value: string;
  siteId: string;
  siteMap?: SiteMap;
}

const SingleItem = (props: SingleItemProps) => {
  const sdk = useSDK<FieldAppSDK>();
  const { fieldType } = sdk.parameters.instance as unknown as AppInstanceParameters;

  const onRemoveItem = async () => {
    await sdk.field.removeValue();

    if (fieldType === 'category') {
      await writeSiteMap(sdk, removeFromSiteMap(readSiteMap(sdk), parseCategoryId(props.value)));
    }
  };

  return (
    <ItemCard
      id={props.value}
      type={fieldType}
      siteId={props.siteId}
      siteMap={props.siteMap}
      onRemove={onRemoveItem}
    />
  );
};

export default SingleItem;
