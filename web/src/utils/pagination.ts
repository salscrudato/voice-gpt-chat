/**
 * Pagination utilities
 */

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginationResult<T> {
  items: T[];
  pagination: PaginationState;
}

/**
 * Calculate pagination state
 */
export function calculatePagination(
  totalItems: number,
  currentPage: number,
  pageSize: number
): PaginationState {
  const totalPages = Math.ceil(totalItems / pageSize);
  const validPage = Math.max(1, Math.min(currentPage, totalPages || 1));

  return {
    currentPage: validPage,
    pageSize,
    totalItems,
    totalPages,
  };
}

/**
 * Paginate array
 */
export function paginate<T>(
  items: T[],
  currentPage: number,
  pageSize: number
): PaginationResult<T> {
  const pagination = calculatePagination(items.length, currentPage, pageSize);
  const startIndex = (pagination.currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    items: items.slice(startIndex, endIndex),
    pagination,
  };
}

/**
 * Get page numbers for pagination UI
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | string)[] {
  const pages: (number | string)[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  let startPage = Math.max(1, currentPage - halfVisible);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    pages.push(1);
    if (startPage > 2) {
      pages.push("...");
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pages.push("...");
    }
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Check if page is valid
 */
export function isValidPage(page: number, totalPages: number): boolean {
  return page >= 1 && page <= totalPages;
}

