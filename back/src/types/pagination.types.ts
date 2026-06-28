// src/types/pagination.types.ts
export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
  };
}