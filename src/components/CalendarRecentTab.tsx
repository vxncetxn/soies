import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
  useWindowDimensions,
} from "react-native";

import type { RecentEntryCursor, RecentEntryPreviewPage } from "../db/repositories/entries";

import {
  packRecentEntryRows,
  resolveFocusedPeriod,
  type CalendarEntryPreview,
  type PeriodFrame,
  type RecentEntryRow,
} from "../data/calendarBrowse";
import { loadRecentPreviewPage } from "../data/calendarBrowseCache";
import CalendarEntryPreviewCard from "./CalendarEntryPreview";

export const RECENT_CONTENT_TOP = 170;
const CONTENT_GUTTER = 20;
const CONTENT_MAX_WIDTH = 620;
const CARD_GAP = 10;
const FOCUS_HYSTERESIS = 12;
const BOTTOM_PADDING = 96;
const EAGER_PREVIEW_ROW_COUNT = 4;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 };

type CalendarRecentTabProps = {
  resetVersion: number;
  onFocusedDayChange: (day: string) => void;
  onHasMoreBelowChange: (hasMoreBelow: boolean) => void;
  onSelectEntry: (day: string, entryId: string) => void;
};

function periodFrames(rows: readonly RecentEntryRow[], rowHeight: number): PeriodFrame[] {
  const frames: PeriodFrame[] = [];
  rows.forEach((row, index) => {
    const start = RECENT_CONTENT_TOP + index * (rowHeight + CARD_GAP);
    const end = start + rowHeight;
    const previous = frames.at(-1);
    if (previous?.id === row.day) {
      previous.end = end;
    } else {
      frames.push({ id: row.day, start, end });
    }
  });
  return frames;
}

function LoadingRows({ width, height }: { width: number; height: number }) {
  return (
    <View style={{ paddingTop: RECENT_CONTENT_TOP, width, alignSelf: "center", gap: CARD_GAP }}>
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} style={{ height, borderRadius: 16, backgroundColor: "#F4F4F4" }} />
      ))}
    </View>
  );
}

export default function CalendarRecentTab({
  resetVersion,
  onFocusedDayChange,
  onHasMoreBelowChange,
  onSelectEntry,
}: CalendarRecentTabProps) {
  const window = useWindowDimensions();
  const contentWidth = Math.min(
    CONTENT_MAX_WIDTH,
    Math.max(240, window.width - CONTENT_GUTTER * 2),
  );
  const pairWidth = (contentWidth - CARD_GAP) / 2;
  const rowHeight = Math.min(220, pairWidth);
  const listRef = useRef<FlashListRef<RecentEntryRow>>(null);
  const [previews, setPreviews] = useState<CalendarEntryPreview[]>([]);
  const [cursor, setCursor] = useState<RecentEntryCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstError, setFirstError] = useState<Error | null>(null);
  const [moreError, setMoreError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [visibleEntryIds, setVisibleEntryIds] = useState<Set<string>>(new Set());
  const [firstPage, setFirstPage] = useState<RecentEntryPreviewPage | null>(null);
  const [observedResetVersion, setObservedResetVersion] = useState(resetVersion);
  const resetVersionRef = useRef(resetVersion);
  const mountedRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const rows = packRecentEntryRows(previews);
  const frames = periodFrames(rows, rowHeight);

  // Reset retained browse state during render so React commits one coherent
  // first-page frame. The native scroll position is synchronized below.
  if (observedResetVersion !== resetVersion) {
    setObservedResetVersion(resetVersion);
    setLoadingMore(false);
    setMoreError(null);
    if (firstPage) {
      setPreviews(firstPage.items);
      setCursor(firstPage.nextCursor);
      setHasMore(firstPage.hasMore);
      setFocusedDay(firstPage.items[0]?.date ?? null);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRecentPreviewPage(null)
      .then((page) => {
        if (cancelled) {
          return;
        }
        setFirstPage(page);
        setPreviews(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setLoading(false);
        setFirstError(null);
        const firstDay = page.items[0]?.date;
        if (firstDay) {
          setFocusedDay(firstDay);
          onFocusedDayChange(firstDay);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFirstError(error instanceof Error ? error : new Error(String(error)));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, onFocusedDayChange]);

  const updateBottomFade = (offset: number) => {
    const contentEnd = Math.max(0, contentHeightRef.current - BOTTOM_PADDING);
    const hasScrollableContent = contentEnd > viewportHeightRef.current + 1;
    const moreBelow = hasScrollableContent && offset + viewportHeightRef.current < contentEnd - 8;
    onHasMoreBelowChange(moreBelow);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    viewportHeightRef.current = layoutMeasurement.height;
    contentHeightRef.current = contentSize.height;
    updateBottomFade(contentOffset.y);

    const nextFocused = resolveFocusedPeriod(
      frames,
      contentOffset.y,
      layoutMeasurement.height,
      focusedDay,
      FOCUS_HYSTERESIS,
    );
    if (nextFocused && nextFocused !== focusedDay) {
      setFocusedDay(nextFocused);
      onFocusedDayChange(nextFocused);
    }
  };

  const loadMore = () => {
    if (!hasMore || !cursor || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    const requestResetVersion = resetVersionRef.current;
    setLoadingMore(true);
    setMoreError(null);
    void loadRecentPreviewPage(cursor)
      .then((page) => {
        if (!mountedRef.current || requestResetVersion !== resetVersionRef.current) {
          return;
        }
        setPreviews((current) => [...current, ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((error: unknown) => {
        if (mountedRef.current && requestResetVersion === resetVersionRef.current) {
          setMoreError(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .finally(() => {
        if (requestResetVersion === resetVersionRef.current) {
          loadingMoreRef.current = false;
          if (mountedRef.current) {
            setLoadingMore(false);
          }
        }
      });
  };

  useLayoutEffect(() => {
    resetVersionRef.current = resetVersion;
    loadingMoreRef.current = false;
    scrollOffsetRef.current = 0;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      const firstDay = firstPage?.items[0]?.date;
      if (firstDay) {
        onFocusedDayChange(firstDay);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [firstPage, onFocusedDayChange, resetVersion]);

  // React Compiler retains this callback while its captures are stable, so
  // FlashList receives stable observer identity without a manual useCallback.
  const onViewableItemsChanged = ({
    viewableItems,
  }: {
    viewableItems: ViewToken<RecentEntryRow>[];
  }) => {
    const visible = new Set<string>();
    for (const token of viewableItems) {
      for (const entry of token.item.entries) {
        visible.add(entry.id);
      }
    }
    setVisibleEntryIds(visible);
  };

  if (loading) {
    return <LoadingRows width={contentWidth} height={rowHeight} />;
  }

  if (firstError) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateText}>Couldn&apos;t load recent entries.</Text>
        <Pressable
          onPress={() => {
            setLoading(true);
            setFirstError(null);
            setAttempt((current) => current + 1);
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading recent entries"
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateText}>No entries yet</Text>
      </View>
    );
  }

  return (
    <FlashList
      ref={listRef}
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item, index }) => (
        <View style={[styles.row, { height: rowHeight, width: contentWidth }]}>
          {item.entries.map((entry) => (
            <CalendarEntryPreviewCard
              key={entry.id}
              entry={entry}
              focused={focusedDay === item.day}
              height={rowHeight}
              width={item.entries.length === 1 ? contentWidth : pairWidth}
              renderContent={index < EAGER_PREVIEW_ROW_COUNT || visibleEntryIds.has(entry.id)}
              onPress={() => onSelectEntry(entry.date, entry.id)}
            />
          ))}
        </View>
      )}
      contentContainerStyle={{
        paddingTop: RECENT_CONTENT_TOP,
        paddingBottom: BOTTOM_PADDING,
        alignItems: "center",
      }}
      ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
      drawDistance={rowHeight + CARD_GAP}
      maxItemsInRecyclePool={8}
      onScroll={handleScroll}
      scrollEventThrottle={32}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={VIEWABILITY_CONFIG}
      onLayout={(event) => {
        viewportHeightRef.current = event.nativeEvent.layout.height;
        updateBottomFade(scrollOffsetRef.current);
      }}
      onContentSizeChange={(_width, height) => {
        contentHeightRef.current = height;
        updateBottomFade(scrollOffsetRef.current);
      }}
      showsVerticalScrollIndicator={false}
      maintainVisibleContentPosition={{ disabled: true }}
      extraData={`${focusedDay ?? ""}:${Array.from(visibleEntryIds).join(",")}`}
      ListFooterComponent={
        moreError ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>Couldn&apos;t load older entries.</Text>
            <Pressable
              onPress={loadMore}
              accessibilityRole="button"
              accessibilityLabel="Retry loading older entries"
              style={styles.footerRetry}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: "center",
    flexDirection: "row",
    gap: CARD_GAP,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: RECENT_CONTENT_TOP / 2,
  },
  stateText: {
    color: "#252525",
    fontFamily: "Geist-Regular",
    fontSize: 16,
  },
  retryButton: {
    borderColor: "#DEDAD7",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: {
    color: "#252525",
    fontFamily: "Geist-Medium",
    fontSize: 14,
  },
  footer: {
    alignItems: "center",
    gap: 8,
    minHeight: 80,
    paddingTop: 18,
  },
  footerText: {
    color: "#79716B",
    fontFamily: "Geist-Regular",
    fontSize: 13,
  },
  footerRetry: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
