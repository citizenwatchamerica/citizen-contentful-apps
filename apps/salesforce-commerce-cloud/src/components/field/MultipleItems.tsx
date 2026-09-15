import React from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { Flex } from '@contentful/f36-components';
import { FieldAppSDK } from '@contentful/app-sdk';

import { AppInstanceParameters } from '../../locations/Field';

import { DndContext, closestCenter, PointerSensor, useSensor } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandle } from '@contentful/f36-components';
import ItemCard from './ItemCard';
import { SiteMap, readSiteMap, writeSiteMap, removeFromSiteMap } from '../../utils/siteMap';
import { parseCategoryId } from '../../utils/Sfcc';

interface MultipleItemsProps {
  value: string[];
  siteId: string;
  siteMap?: SiteMap;
}

const MultipleItems = ({ value: items, siteId, siteMap }: MultipleItemsProps) => {
  const sdk = useSDK<FieldAppSDK>();
  const { fieldType } = sdk.parameters.instance as AppInstanceParameters;

  const onRemoveItem = async (id: string) => {
    const updatedItems = items.filter((value) => value !== id);
    updatedItems.length ? await sdk.field.setValue(updatedItems) : await sdk.field.removeValue();

    // Categories only — a product connector field on the same content type would
    // otherwise prune the category map using product ids.
    if (fieldType === 'category') {
      await writeSiteMap(sdk, removeFromSiteMap(readSiteMap(sdk), parseCategoryId(id)));
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);

      sdk.field.setValue(arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <>
      <DndContext
        sensors={[useSensor(PointerSensor)]}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <Flex flexDirection="column" gap="spacingXs">
            {items.map((id: string) => (
              <SortableCard
                key={id}
                id={id}
                type={fieldType}
                siteId={siteId}
                siteMap={siteMap}
                onRemove={onRemoveItem}
                withDragHandle={true}
              />
            ))}
          </Flex>
        </SortableContext>
      </DndContext>
    </>
  );
};

const SortableCard = (props: any) => {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
    id: props.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard
        {...props}
        dragHandleRender={() => (
          <DragHandle {...listeners} as="button" label="Move card" ref={setActivatorNodeRef} />
        )}
      />
    </div>
  );
};

export default MultipleItems;
