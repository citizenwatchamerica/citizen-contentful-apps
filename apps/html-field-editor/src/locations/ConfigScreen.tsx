import { ConfigAppSDK } from '@contentful/app-sdk';
import { Flex, Form, Heading, Paragraph } from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useCallback, useEffect } from 'react';

export interface AppInstallationParameters {}

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();

  const onConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState();
    return { parameters: {}, targetState: currentState };
  }, [sdk]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      await sdk.app.getParameters();
      sdk.app.setReady();
    })();
  }, [sdk]);

  return (
    <Flex flexDirection="column" className={css({ margin: '80px', maxWidth: '800px' })}>
      <Form>
        <Heading>HTML Rich Text Editor — Configuration</Heading>
        <Paragraph>No additional configuration required for this app.</Paragraph>
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
