'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import '../styles/mantine-shelf.css';
import '../styles/shelf.css';
import { useAuth } from '@/hooks/useAuth';
import { useShelfData } from '@/hooks/useShelfData';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import { AppScreen } from '@/components/AppShell';
import { BookCard } from '@/components/BookCard';
import { ShelfHeader } from '@/components/ShelfHeader';
import { ShelfBatchBar } from '@/components/shelf/ShelfBatchBar';
import { ShelfBookGrid } from '@/components/shelf/ShelfBookGrid';
import { ShelfCategoryBar } from '@/components/shelf/ShelfCategoryBar';
import { ShelfDialogs } from '@/components/shelf/ShelfDialogs';
import { ShelfDropOverlay } from '@/components/shelf/ShelfDropOverlay';
import { ShelfScrollToTop } from '@/components/shelf/ShelfScrollToTop';
import {
  ShelfAuthLoadingView,
  ShelfEmptyLibraryState,
  ShelfLoadErrorState,
  ShelfOfflineState,
} from '@/components/shelf/ShelfStateViews';
import { ShelfToolbar } from '@/components/shelf/ShelfToolbar';
import {
  SUPPORTED_FORMATS_ACCEPT,
  UNCATEGORIZED_FILTER_ID,
  type ShelfReadingStatus,
} from '@/components/shelf/constants';
import { useShelfFileDrop } from '@/components/shelf/useShelfFileDrop';
import { useShelfSelection } from '@/components/shelf/useShelfSelection';
import { prefetchFoliateEngine } from '@/lib/foliate-loader';

type ShelfViewMode = 'grid' | 'list';

const SHELF_VIEW_MODE_STORAGE_KEY = 'z-reader-shelf-view-mode';
const SHELF_VIEW_MODE_EVENT = 'z-reader-shelf-view-mode-change';

function getServerShelfViewModeSnapshot(): ShelfViewMode {
  return 'grid';
}

function getShelfViewModeSnapshot(): ShelfViewMode {
  if (typeof window === 'undefined') return 'grid';
  try {
    return window.localStorage.getItem(SHELF_VIEW_MODE_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function subscribeShelfViewMode(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SHELF_VIEW_MODE_STORAGE_KEY) {
      onStoreChange();
    }
  };
  window.addEventListener(SHELF_VIEW_MODE_EVENT, onStoreChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(SHELF_VIEW_MODE_EVENT, onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function persistShelfViewMode(mode: ShelfViewMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHELF_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota / privacy mode failures and still notify listeners if needed.
  }
  window.dispatchEvent(new Event(SHELF_VIEW_MODE_EVENT));
}

export default function ShelfPage() {
  const router = useRouter();
  const prefetchedBookIdsRef = useRef<Set<string>>(new Set());
  const viewMode = useSyncExternalStore(
    subscribeShelfViewMode,
    getShelfViewModeSnapshot,
    getServerShelfViewModeSnapshot
  );
  const [readingStatus, setReadingStatus] = useState<ShelfReadingStatus>('all');
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [offlineBooksOpen, setOfflineBooksOpen] = useState(false);
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);

  const { isLoading, isAuthenticated, isOffline, passwordRequired, logout, checkAuth } = useAuth();
  const { toggleTheme, isDark } = useShelfTheme();
  const {
    books,
    progressByBookId,
    categories,
    isLoadingBooks,
    isSearching,
    isLoadingMoreBooks,
    hasMoreBooks,
    loadError,
    searchError,
    retrySearch,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    uploadProgress,
    deletingId,
    isDeletingMany,
    isUpdatingManyCategories,
    isReparsingMany,
    filteredBooks,
    bookCounts,
    refreshBooks,
    loadMoreBooks,
    handleUpload,
    handleDelete,
    handleDeleteMany,
    handleUpdateCategoryMany,
    handleRenameCategory,
    handleReparseMany,
    searchQuery,
    setSearchQuery,
    uploadFiles,
    formatFileSize,
    sortBy,
    setSortBy,
  } = useShelfData(isAuthenticated);

  const hasSearchQuery = searchQuery.trim().length > 0;
  const isLibraryEmpty =
    books.length === 0 &&
    bookCounts.all === 0 &&
    selectedCategoryId === null &&
    !hasSearchQuery;
  const readingCounts = useMemo(() => {
    let reading = 0;
    let unread = 0;
    let finished = 0;
    for (const book of filteredBooks) {
      const pct = Math.min(Math.max(Math.round(progressByBookId[book.id] ?? 0), 0), 100);
      if (pct >= 100) {
        finished += 1;
      } else if (pct > 0) {
        reading += 1;
      } else {
        unread += 1;
      }
    }
    return { reading, unread, finished };
  }, [filteredBooks, progressByBookId]);

  const visibleBooks = useMemo(() => {
    if (readingStatus === 'all') return filteredBooks;
    return filteredBooks.filter((book) => {
      const pct = Math.min(Math.max(Math.round(progressByBookId[book.id] ?? 0), 0), 100);
      if (readingStatus === 'finished') return pct >= 100;
      if (readingStatus === 'reading') return pct > 0 && pct < 100;
      return pct <= 0;
    });
  }, [filteredBooks, progressByBookId, readingStatus]);

  const baseResultsLabel = hasSearchQuery
    ? '搜索结果'
    : selectedCategoryId === UNCATEGORIZED_FILTER_ID
      ? '未分类书籍'
      : selectedCategoryId ?? '全部书籍';
  const statusResultsLabel =
    readingStatus === 'reading'
      ? '在读'
      : readingStatus === 'unread'
        ? '未读'
        : readingStatus === 'finished'
          ? '已读完'
          : null;
  const resultsLabel = statusResultsLabel
    ? `${baseResultsLabel} · ${statusResultsLabel}`
    : baseResultsLabel;
  const isFiltered = Boolean(hasSearchQuery || selectedCategoryId !== null || readingStatus !== 'all');
  const uploadStatusLabel = uploadProgress
    ? `上传 ${uploadProgress.current}/${uploadProgress.total}`
    : isUploading
      ? '上传中'
      : undefined;
  const showCategoryFilters = !isOffline && !loadError && !isLoadingBooks && !isLibraryEmpty;
  const showShelfControlsSkeleton = !isOffline && !loadError && isLoadingBooks;
  const isBatchBusy = isDeletingMany || isUpdatingManyCategories || isReparsingMany;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isOffline) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, isOffline, router]);

  const filteredBookIds = useMemo(() => visibleBooks.map((book) => book.id), [visibleBooks]);

  const {
    selectionMode,
    selectedBookIds,
    selectedCount,
    allVisibleSelected,
    batchDeleteOpen,
    setBatchDeleteOpen,
    batchCategoryOpen,
    setBatchCategoryOpen,
    toggleBookSelection,
    clearSelectionWhenFiltering,
    toggleSelectionMode,
    toggleVisibleSelection,
    confirmBatchDelete,
    saveBatchCategory,
  } = useShelfSelection({
    filteredBookIds,
    isBatchBusy,
    externalDialogOpen: categoryManagerOpen || offlineBooksOpen,
    onDeleteMany: handleDeleteMany,
    onUpdateCategoryMany: handleUpdateCategoryMany,
  });

  const canDropBookFiles =
    !isOffline &&
    !isLoadingBooks &&
    !loadError &&
    !batchDeleteOpen &&
    !batchCategoryOpen &&
    !categoryManagerOpen &&
    !offlineBooksOpen;

  const {
    isDraggingBookFile,
    handleShelfDragEnter,
    handleShelfDragOver,
    handleShelfDragLeave,
    handleShelfDrop,
  } = useShelfFileDrop({
    canDropBookFiles,
    isUploading,
    onUploadFiles: uploadFiles,
  });

  const handleEndReached = useCallback(() => {
    void loadMoreBooks();
  }, [loadMoreBooks]);

  const getBookItemKey = useCallback(
    (book: (typeof filteredBooks)[number]) => book.id,
    []
  );

  const handleReadBook = useCallback(
    (bookId: string) => {
      router.push(`/read/${bookId}`);
    },
    [router]
  );

  const handlePrefetchBook = useCallback(
    (bookId: string) => {
      prefetchFoliateEngine();
      if (prefetchedBookIdsRef.current.has(bookId)) return;
      prefetchedBookIdsRef.current.add(bookId);
      router.prefetch(`/read/${bookId}`);
    },
    [router]
  );

  const renderBookCard = useCallback(
    (book: (typeof filteredBooks)[number], index: number) => (
      <BookCard
        book={book}
        index={index}
        categories={categories}
        bookCounts={bookCounts}
        onRead={handleReadBook}
        onPrefetch={handlePrefetchBook}
        onDelete={handleDelete}
        onUpdate={refreshBooks}
        isDeleting={deletingId === book.id}
        formatSize={formatFileSize}
        progressPercentage={progressByBookId[book.id] ?? null}
        searchQuery={searchQuery}
        selectionMode={selectionMode}
        selected={selectedBookIds.has(book.id)}
        onSelectionToggle={toggleBookSelection}
        layout={viewMode}
      />
    ),
    [
      categories,
      bookCounts,
      handleReadBook,
      handlePrefetchBook,
      handleDelete,
      refreshBooks,
      deletingId,
      formatFileSize,
      progressByBookId,
      searchQuery,
      selectionMode,
      selectedBookIds,
      toggleBookSelection,
      viewMode,
    ]
  );

  async function handleRetryConnection() {
    if (isRetryingAuth) return;
    setIsRetryingAuth(true);
    try {
      const status = await checkAuth();
      if (status === 'offline') {
        toast.error('仍无法连接服务器，请检查网络后再试');
      }
    } finally {
      setIsRetryingAuth(false);
    }
  }

  function changeSearchQuery(value: string) {
    setSearchQuery(value);
    clearSelectionWhenFiltering();
  }

  function changeSelectedCategory(categoryId: string | null) {
    setSelectedCategoryId(categoryId);
    clearSelectionWhenFiltering();
  }

  function changeReadingStatus(nextStatus: ShelfReadingStatus) {
    setReadingStatus(nextStatus);
    clearSelectionWhenFiltering();
  }

  function clearShelfFilters() {
    changeSearchQuery('');
    changeSelectedCategory(null);
    setReadingStatus('all');
  }

  async function saveManagedCategory(category: string, nextCategory: string | null) {
    await handleRenameCategory(category, nextCategory);
  }

  async function handleBatchReparse() {
    const selectedIds = filteredBookIds.filter((id) => selectedBookIds.has(id));
    if (selectedIds.length === 0 || isBatchBusy) return;
    const result = await handleReparseMany(selectedIds);
    if (result.successCount > 0) {
      if (result.failedCount === 0) {
        toggleSelectionMode();
      } else if (result.updatedIds?.length) {
        result.updatedIds.forEach((id) => toggleBookSelection(id));
      } else {
        clearSelectionWhenFiltering();
      }
    }
  }

  function handleLogout() {
    void logout().catch(() => toast.error('退出失败，请重试'));
  }

  if (isLoading || (!isAuthenticated && !isOffline)) {
    return <ShelfAuthLoadingView />;
  }

  return (
    <AppScreen
      className="overflow-clip bg-[var(--shelf-app-bg)] font-sans"
      contentClassName="shelf-atmosphere flex min-h-dvh w-full flex-col"
    >
      <ShelfHeader
        uploadAccept={SUPPORTED_FORMATS_ACCEPT}
        isOffline={isOffline}
        isUploading={isUploading}
        uploadStatusLabel={uploadStatusLabel}
        isQuietUpload={!isLoadingBooks && !loadError && isLibraryEmpty}
        isDark={isDark}
        onUpload={handleUpload}
        onToggleTheme={toggleTheme}
        onManageOfflineBooks={() => setOfflineBooksOpen(true)}
        onLogout={!isOffline && passwordRequired ? handleLogout : undefined}
      />

      <main
        id="shelf-main"
        aria-label="书库"
        className="app-container relative z-10 flex-1 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:pt-5 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
        onDragEnter={handleShelfDragEnter}
        onDragOver={handleShelfDragOver}
        onDragLeave={handleShelfDragLeave}
        onDrop={handleShelfDrop}
      >
        <ShelfToolbar
          isOffline={isOffline}
          isLoadingBooks={isLoadingBooks}
          loadError={loadError}
          totalBookCount={bookCounts.all}
          filteredBookCount={visibleBooks.length}
          selectedCategoryId={selectedCategoryId}
          hasSearchQuery={hasSearchQuery}
          hasStatusFilter={readingStatus !== 'all'}
          showCategoryFilters={showCategoryFilters}
          showShelfControlsSkeleton={showShelfControlsSkeleton}
          searchQuery={searchQuery}
          isSearching={isSearching}
          onSearchQueryChange={changeSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={persistShelfViewMode}
        />

        {isOffline ? (
          <ShelfOfflineState
            isRetryingAuth={isRetryingAuth}
            onRetryConnection={handleRetryConnection}
            onOpenOfflineBooks={() => setOfflineBooksOpen(true)}
          />
        ) : !isLoadingBooks && loadError ? (
          <ShelfLoadErrorState loadError={loadError} onRetry={refreshBooks} />
        ) : !isLoadingBooks && isLibraryEmpty ? (
          <ShelfEmptyLibraryState
            isUploading={isUploading}
            uploadStatusLabel={uploadStatusLabel}
            onUpload={handleUpload}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <ShelfCategoryBar
              showCategoryFilters={showCategoryFilters}
              showShelfControlsSkeleton={showShelfControlsSkeleton}
              categories={categories}
              bookCounts={bookCounts}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={changeSelectedCategory}
              readingStatus={readingStatus}
              onSelectReadingStatus={changeReadingStatus}
              readingCounts={readingCounts}
              selectionMode={selectionMode}
              isBatchBusy={isBatchBusy}
              onOpenCategoryManager={() => setCategoryManagerOpen(true)}
              onToggleSelectionMode={toggleSelectionMode}
            />

            <ShelfBookGrid
              books={books}
              filteredBooks={visibleBooks}
              totalBookCount={bookCounts.all}
              selectedCategoryId={selectedCategoryId}
              searchQuery={searchQuery}
              sortBy={sortBy}
              resultsLabel={resultsLabel}
              isFiltered={isFiltered}
              hasSearchQuery={hasSearchQuery}
              isLoadingBooks={isLoadingBooks}
              isSearching={isSearching}
              searchError={searchError}
              hasMoreBooks={hasMoreBooks}
              isLoadingMoreBooks={isLoadingMoreBooks}
              selectionMode={selectionMode}
              viewMode={viewMode}
              onRetrySearch={retrySearch}
              onClearFilters={clearShelfFilters}
              onLoadMore={loadMoreBooks}
              onEndReached={handleEndReached}
              getBookItemKey={getBookItemKey}
              renderBookCard={renderBookCard}
            />

            {selectionMode && !isLoadingBooks && !isSearching && visibleBooks.length > 0 && (
              <ShelfBatchBar
                selectedCount={selectedCount}
                allVisibleSelected={allVisibleSelected}
                hasMoreBooks={hasMoreBooks}
                isBatchBusy={isBatchBusy}
                isDeletingMany={isDeletingMany}
                isUpdatingManyCategories={isUpdatingManyCategories}
                isReparsingMany={isReparsingMany}
                onToggleSelectionMode={toggleSelectionMode}
                onToggleVisibleSelection={toggleVisibleSelection}
                onOpenBatchCategory={() => setBatchCategoryOpen(true)}
                onBatchReparse={() => {
                  void handleBatchReparse();
                }}
                onOpenBatchDelete={() => setBatchDeleteOpen(true)}
              />
            )}
          </div>
        )}

        {isDraggingBookFile && canDropBookFiles && (
          <ShelfDropOverlay isUploading={isUploading} />
        )}

        <ShelfDialogs
          selectedCount={selectedCount}
          categories={categories}
          bookCounts={bookCounts}
          batchDeleteOpen={batchDeleteOpen}
          onBatchDeleteOpenChange={setBatchDeleteOpen}
          isDeletingMany={isDeletingMany}
          onConfirmBatchDelete={confirmBatchDelete}
          batchCategoryOpen={batchCategoryOpen}
          onBatchCategoryOpenChange={setBatchCategoryOpen}
          isUpdatingManyCategories={isUpdatingManyCategories}
          onSaveBatchCategory={saveBatchCategory}
          categoryManagerOpen={categoryManagerOpen}
          onCategoryManagerOpenChange={setCategoryManagerOpen}
          onRenameCategory={saveManagedCategory}
          offlineBooksOpen={offlineBooksOpen}
          onOfflineBooksOpenChange={setOfflineBooksOpen}
        />

        <ShelfScrollToTop
          hasBatchBar={selectionMode && !isLoadingBooks && !isSearching && filteredBooks.length > 0}
        />
      </main>
    </AppScreen>
  );
}
