import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollBehavior } from './scrollBehavior';

/**
 * Resets scroll position to the top on every route change so navigating via a
 * link (footer, quick link, card, etc.) always lands you at the top of the new
 * page instead of wherever the previous page was scrolled to.
 *
 * If the destination URL carries a #hash, we defer to the browser's native
 * anchor behavior and scroll that element into view instead.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // Let the target section win over a hard top-scroll.
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        return;
      }
    }
    // 'instant' avoids a jarring animated whoosh on every navigation.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}
