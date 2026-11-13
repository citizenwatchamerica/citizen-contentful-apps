import React from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { FieldAppSDK } from '@contentful/app-sdk';

import { AppInstanceParameters } from '../../locations/Field';
import ItemCard from './ItemCard';
import { SiteStock } from './useSiteStock';

interface SingleItemProps {
  value: string;
  siteId?: string;
  siteStock?: SiteStock;
}

const SingleItem = (props: SingleItemProps) => {
  const sdk = useSDK<FieldAppSDK>();
  const { fieldType } = sdk.parameters.instance as unknown as AppInstanceParameters;

  const onRemoveItem = async () => {
    await sdk.field.removeValue();
  };

  return (
    <ItemCard
      id={props.value}
      type={fieldType}
      siteId={props.siteId}
      siteStock={props.siteStock}
      onRemove={onRemoveItem}
    />
  );
};

export default SingleItem;
