import type { ScrollView } from "react-native";

/**
 * usePagingScroll — shared wiring for axis-aligned paging ScrollViews.
 *
 * First consumer: GalleryPager. DayPager / Stack / Create keep their local
 * copies until a follow-up migration.
 */
import { useAnimatedRef, useSharedValue, type SharedValue } from "react-native-reanimated";

type Axis = "x" | "y";

type UsePagingScrollOptions = {
  /** Pixel size of one page along the scroll axis. */
  pageSize: SharedValue<number> | number;
  axis?: Axis;
};

export function usePagingScroll({ pageSize, axis = "x" }: UsePagingScrollOptions) {
  const scrollRef = useAnimatedRef<ScrollView>();
  const scrollOffset = useSharedValue(0);

  const resolvePageSize = () => {
    if (typeof pageSize === "number") {
      return pageSize;
    }
    return pageSize.get();
  };

  /**
   * Jump to a page index. Writes `scrollOffset` immediately so indicators do
   * not lag a frame. `animated` defaults false (DayPager jump style); Gallery
   * delete uses animated true so the neighbor slides into place.
   */
  const jumpToIndex = (index: number, animated = false) => {
    const size = resolvePageSize();
    if (size <= 0) {
      return;
    }
    const offset = index * size;
    if (axis === "x") {
      scrollRef.current?.scrollTo({ x: offset, y: 0, animated });
    } else {
      scrollRef.current?.scrollTo({ x: 0, y: offset, animated });
    }
    scrollOffset.set(offset);
  };

  return { scrollRef, scrollOffset, jumpToIndex };
}
