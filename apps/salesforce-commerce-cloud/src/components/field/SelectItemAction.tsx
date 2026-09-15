import React, { useState, useEffect } from 'react';
import { css } from '@emotion/react';
import { useQueries } from '@tanstack/react-query';

import { FieldAppSDK } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';

import { Flex, Button } from '@contentful/f36-components';
import { ShoppingCartIcon } from '@contentful/f36-icons';
import tokens from '@contentful/f36-tokens';

import { AppInstanceParameters } from '../../locations/Field';
import logo from '../../Salesforce_Corporate_Logo_RGB.png';
import SfccClient, { parseCategoryId } from '../../utils/Sfcc';
import { AppInstallationParameters } from '../../locations/ConfigScreen';
import { DialogInvocationParameters } from '../../locations/Dialog';
import { SearchPickerResult } from '../dialog/SearchPicker';
import { SITE_MAP_FIELD_ID, readSiteMap, writeSiteMap } from '../../utils/siteMap';

const logoStyle = css`
  display: block;
  width: 70px;
  height: 50px;
  margin-right: ${tokens.spacingM};
`;

interface SelectItemActionProps {
  fieldValue?: string | string[];
  siteIds: string[];
}

const SelectItemAction = (props: SelectItemActionProps) => {
  const sdk = useSDK<FieldAppSDK>();
  const selectMultiple = sdk.field.type === 'Array';
  const { fieldType } = sdk.parameters.instance as AppInstanceParameters;
  const installParameters = sdk.parameters.installation as AppInstallationParameters;
  const [currentData, setCurrentData] = useState<any[]>([]);

  const queryArray: string[] = [];
  if (props.fieldValue) {
    props.fieldValue instanceof Array
      ? queryArray.push(...props.fieldValue)
      : queryArray.push(props.fieldValue);
  }

  const client = new SfccClient(installParameters, props.siteIds[0]);
  const siteMap = fieldType === 'category' ? readSiteMap(sdk) : {};
  const currentItemQueries = useQueries({
    queries: queryArray.map((rawId: string) => {
      const id = fieldType === 'category' ? parseCategoryId(rawId) : rawId;
      const storedSiteId = siteMap[id];
      return {
        queryKey: ['itemInfo', id, storedSiteId],
        queryFn:
          fieldType === 'product'
            ? () => client.fetchProduct(id)
            : () => client.fetchCategoryById(id, storedSiteId),
      };
    }),
  });

  const queriesComplete = currentItemQueries.every((query) => query.isSuccess || query.isError);

  useEffect(() => {
    if (queriesComplete) {
      const updatedData: any[] = [];
      for (const query of currentItemQueries) {
        if (query.isSuccess) {
          updatedData.push(query.data);
        }
      }

      if (updatedData.length) {
        setCurrentData(updatedData);
      }
    }
  }, [queriesComplete]);

  const makeCTAText = (selectMultiple: boolean, fieldType: string) => {
    let ctaText = 'Select ';
    if (selectMultiple) {
      ctaText += fieldType === 'product' ? 'products' : 'categories';
    } else {
      ctaText += `a ${fieldType}`;
    }

    return ctaText;
  };

  const onButtonClick = async () => {
    const parameters: DialogInvocationParameters = {
      selectMultiple: selectMultiple,
      fieldType: fieldType,
      currentData: currentData,
      fieldValue: props.fieldValue,
      siteIds: props.siteIds,
      siteMap: fieldType === 'category' ? readSiteMap(sdk) : undefined,
    };

    if (!queryArray.length || queriesComplete) {
      const result: SearchPickerResult | undefined = await sdk.dialogs.openCurrent({
        width: 1400,
        shouldCloseOnOverlayClick: true,
        parameters,
      });

      if (!result?.value?.length) return;

      await sdk.field.setValue(result.value);

      // The companion field is added by hand per content type, so a failure to
      // write it is a setup problem worth surfacing rather than swallowing. The
      // selection itself is already saved, and cards fall back to deriving the
      // site from the category's catalog.
      if (fieldType === 'category') {
        try {
          await writeSiteMap(sdk, result.siteMap);
        } catch {
          sdk.notifier.error(
            `Saved the selection, but could not record the site in ${SITE_MAP_FIELD_ID}.`
          );
        }
      }
    }
  };

  return (
    <Flex marginTop="spacingS">
      <img src={logo} alt="Salesforce Logo" css={logoStyle} />
      <Button
        startIcon={<ShoppingCartIcon />}
        variant="secondary"
        size="small"
        onClick={onButtonClick}>
        {makeCTAText(selectMultiple, fieldType)}
      </Button>
    </Flex>
  );
};

export default SelectItemAction;
