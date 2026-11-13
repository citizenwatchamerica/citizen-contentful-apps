import React, { useState, useEffect } from 'react';

import { FieldAppSDK } from '@contentful/app-sdk';
import { useSDK, useAutoResizer } from '@contentful/react-apps-toolkit';

import SelectItemAction from '../components/field/SelectItemAction';
import SingleItem from '../components/field/SingleItem';
import MultipleItems from '../components/field/MultipleItems';
import { useSiteStock } from '../components/field/useSiteStock';

import { KeyValueMap } from 'contentful-management';
import { AppInstallationParameters } from './ConfigScreen';
import { siteForLocale } from '../utils/localeSites';

export interface AppInstanceParameters extends KeyValueMap {
  fieldType: 'product' | 'category';
}

const Field = () => {
  useAutoResizer();
  const sdk = useSDK<FieldAppSDK>();
  const installParameters = sdk.parameters.installation as AppInstallationParameters;
  const { fieldType } = sdk.parameters.instance as AppInstanceParameters;
  const siteId = siteForLocale(installParameters.localeSites, sdk.field.locale);

  const selectMultiple = sdk.field.type === 'Array';
  const [value, setValue] = useState<string | string[]>(sdk.field.getValue());

  const productIds = !value ? [] : Array.isArray(value) ? value : [value];
  const siteStock = useSiteStock(installParameters, siteId, productIds, fieldType === 'product');

  useEffect(() => {
    const valueChangeHandler = async (value: string | string[]) => {
      setValue(value);
    };

    return sdk.field.onValueChanged(valueChangeHandler);
  }, [sdk.field]);

  return (
    <>
      {value?.length && (
        <>
          {selectMultiple ? (
            <MultipleItems value={value as string[]} siteId={siteId} siteStock={siteStock} />
          ) : (
            <SingleItem value={value as string} siteId={siteId} siteStock={siteStock} />
          )}
        </>
      )}
      {(!value?.length || selectMultiple) && (
        <SelectItemAction fieldValue={value} siteId={siteId} />
      )}
    </>
  );
};

export default Field;
