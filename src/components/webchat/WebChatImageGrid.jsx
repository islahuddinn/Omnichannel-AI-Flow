// src/components/webchat/WebChatImageGrid.jsx
/**
 * Image Grid Component for WebChat
 * Displays grouped images in a grid layout using shadcn
 */

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import WebChatImageCarousel from './WebChatImageCarousel';

export default function WebChatImageGrid({ images, className }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);

  if (!images || images.length === 0) return null;

  const getGridLayout = (count) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-2 grid-rows-2'; // 2 columns, 2 rows
    if (count === 4) return 'grid-cols-2';
    return 'grid-cols-2'; // Default for 4+
  };

  const handleImageClick = (index) => {
    setSelectedIndex(index);
    setIsCarouselOpen(true);
  };

  const imageCount = images.length;
  const gridClass = getGridLayout(imageCount);

  return (
    <>
      <div className={cn('grid gap-1 rounded-lg overflow-hidden', gridClass, className)}>
        {images.slice(0, imageCount === 3 ? 3 : imageCount > 4 ? 4 : imageCount).map((image, index) => {
          const isFirstLarge = imageCount === 3 && index === 0;
          
          return (
            <motion.div
              key={index}
              className={cn(
                'relative cursor-pointer overflow-hidden group',
                isFirstLarge && 'row-span-2',
                imageCount === 3 && index > 0 && 'h-24'
              )}
              onClick={() => handleImageClick(index)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <img
                src={image.url || image}
                alt={image.name || 'Shared image'}
                className="w-full h-full object-cover max-h-[300px]"
                loading="lazy"
                decoding="async"
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />
              
              {/* Multiple images indicator */}
              {index === 3 && imageCount > 4 && (
                <div className="absolute inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center text-white font-semibold text-lg z-10">
                  +{imageCount - 4}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Carousel Modal */}
      <WebChatImageCarousel
        images={images}
        isOpen={isCarouselOpen}
        onClose={() => {
          setIsCarouselOpen(false);
          setSelectedIndex(null);
        }}
        initialIndex={selectedIndex || 0}
      />
    </>
  );
}

