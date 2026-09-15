import React, { useState, useEffect } from 'react';

import { FieldAppSDK } from '@contentful/app-sdk';
import { useSDK, useAutoResizer } from '@contentful/react-apps-toolkit';
import { Note } from '@contentful/f36-components';

import SelectItemAction from '../components/field/SelectItemAction';
import SingleItem from '../components/field/SingleItem';
import MultipleItems from '../components/field/MultipleItems';

import { KeyValueMap } from 'contentful-management';
import { AppInstallationParameters, parseSiteIds } from './ConfigScreen';
import {
  SITE_MAP_FIELD_ID,
  SiteMap,
  readSiteMap,
  siteMapFieldExists,
  siteMapFieldTypeIsValid,
  siteMapLocalesMatch,
} from '../utils/siteMap';

export interface AppInstanceParameters extends KeyValueMap {
  fieldType: 'product' | 'category';
}

const Field = () => {
  useAutoResizer();
  const sdk = useSDK<FieldAppSDK>();
  const installParameters = sdk.parameters.installation as AppInstallationParameters;
  const { fieldType } = sdk.parameters.instance as AppInstanceParameters;
  const siteIds = parseSiteIds(installParameters.siteIds);

  const selectMultiple = sdk.field.type === 'Array';
  const [value, setValue] = useState<string | string[]>(sdk.field.getValue());
  const [siteMap, setSiteMap] = useState<SiteMap>(() => readSiteMap(sdk));

  useEffect(() => {
    const valueChangeHandler = async (value: string | string[]) => {
      setValue(value);
    };

    return sdk.field.onValueChanged(valueChangeHandler);
  }, [sdk.field]);

  // This app writes the companion field, but it can also change underneath us
  // — another editor on the same entry, or an import — so track it rather than
  // reading it once on mount.
  useEffect(() => {
    const siteMapField = sdk.entry.fields[SITE_MAP_FIELD_ID];
    if (!siteMapField) return;

    return siteMapField.onValueChanged(sdk.field.locale, () => setSiteMap(readSiteMap(sdk)));
  }, [sdk]);

  return (
    <>
      {fieldType === 'category' && <SiteMapFieldWarning />}
      {value?.length && (
        <>
          {selectMultiple ? (
            <MultipleItems value={value as string[]} siteId={siteIds[0]} siteMap={siteMap} />
          ) : (
            <SingleItem value={value as string} siteId={siteIds[0]} siteMap={siteMap} />
          )}
        </>
      )}
      {(!value?.length || selectMultiple) && (
        <SelectItemAction fieldValue={value} siteIds={siteIds} />
      )}
    </>
  );
};

// Setting the companion field up is a manual step on every content type that uses
// this app, and getting it wrong otherwise fails silently — so say so here, where
// whoever is building the content type will see it.
const SiteMapFieldWarning = () => {
  const sdk = useSDK<FieldAppSDK>();

  if (!siteMapFieldExists(sdk)) {
    return (
      <Note variant="warning" style={{ marginBottom: '0.75rem' }}>
        The selected site cannot be recorded: this content type has no{' '}
        <code>{SITE_MAP_FIELD_ID}</code> field. Add a JSON Object field with that exact ID to
        record it. Cards fall back to showing every site the category&apos;s catalog serves.
      </Note>
    );
  }

  if (!siteMapFieldTypeIsValid(sdk)) {
    return (
      <Note variant="warning" style={{ marginBottom: '0.75rem' }}>
        <code>{SITE_MAP_FIELD_ID}</code> is not a JSON Object field, so the selected site cannot
        be recorded in it. Change its type in the content model.
      </Note>
    );
  }

  if (!siteMapLocalesMatch(sdk)) {
    return (
      <Note variant="warning" style={{ marginBottom: '0.75rem' }}>
        <code>{SITE_MAP_FIELD_ID}</code> does not have the same localization setting as this
        field, so recorded sites can surface on the wrong locale. Match the two settings in the
        content model.
      </Note>
    );
  }

  return null;
};

export default Field;
