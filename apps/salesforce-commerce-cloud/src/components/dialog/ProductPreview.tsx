import React from 'react';

import { Flex, Text } from '@contentful/f36-components';

import { getLocalizedValue } from '../../utils/localized';

const ProductPreview = (props: { product: any; locale?: string }) => {
  const descriptionLength = 178;
  const { product, locale } = props;

  let description = 'Description';
  if (product.shortDescription?.default) {
    description =
      product.shortDescription.default.markup.length > descriptionLength
        ? `${product.shortDescription.default.markup.substring(0, descriptionLength)}...`
        : product.shortDescription.default.markup;
  }

  const imageUrl = product.image?.absUrl;

  return (
    <>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={product.image?.alt?.default || 'Product image'}
          height="75"
          width="75"
        />
      )}
      <Flex flexDirection="column" marginLeft="spacingS">
        <Text as="div" fontWeight="fontWeightDemiBold">
          {getLocalizedValue(product.name, locale) || 'Untitled Product'} (ID: {product.id})
        </Text>
        <Text as="div">{description}</Text>
      </Flex>
    </>
  );
};

export default ProductPreview;
