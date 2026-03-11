import React, { useState, useEffect } from 'react';

import { FieldAppSDK } from '@contentful/app-sdk';
import { useSDK, useAutoResizer } from '@contentful/react-apps-toolkit';

import SelectItemAction from '../components/field/SelectItemAction';
import SingleItem from '../components/field/SingleItem';
import MultipleItems from '../components/field/MultipleItems';

import { KeyValueMap } from 'contentful-management';
import { AppInstallationParameters, parseSiteIds } from './ConfigScreen';

export interface AppInstanceParameters extends KeyValueMap {
  fieldType: 'product' | 'category';
}

const Field = () => {
  useAutoResizer();
  const sdk = useSDK<FieldAppSDK>();
  const installParameters = sdk.parameters.installation as AppInstallationParameters;
  const siteIds = parseSiteIds(installParameters.siteIds);

  const selectMultiple = sdk.field.type === 'Array';
  const [value, setValue] = useState<string | string[]>(sdk.field.getValue());

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
            <MultipleItems value={value as string[]} siteId={siteIds[0]} />
          ) : (
            <SingleItem value={value as string} siteId={siteIds[0]} />
          )}
        </>
      )}
      {(!value?.length || selectMultiple) && (
        <SelectItemAction fieldValue={value} siteIds={siteIds} />
      )}
    </>
  );
};

export default Field;
