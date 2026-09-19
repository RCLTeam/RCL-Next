import React, { type ComponentProps, useContext } from 'react';
import { NavigationContext } from '../navigation.js';

export function SiteLink({ href = '/', onClick, ...props }: ComponentProps<'a'>) {
  const { navigate } = useContext(NavigationContext);
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target ||
          props.download
        )
          return;
        if (!href.startsWith('/') || href.startsWith('//')) return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
