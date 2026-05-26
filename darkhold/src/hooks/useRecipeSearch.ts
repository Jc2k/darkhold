import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Recipe, PaginatedResponse } from '../api/tandoor-types';
import { buildRecentlyAddedRecipeParams } from '../utils/recentRecipes';

interface SearchParams {
  query?: string;
  keywords?: number[];
  foods?: number[];
  page_size?: number;
  rating?: number;
  cooking_time__lte?: number;
  new?: boolean;
  sort_order?: string;
}

export function useRecipeSearch(params: SearchParams) {
  return useInfiniteQuery({
    queryKey: ['recipes', params],
    queryFn: ({ pageParam = 1 }) =>
      apiGet<PaginatedResponse<Recipe>>('/recipe/', {
        ...(params.query ? { query: params.query } : {}),
        ...(params.keywords?.length ? { keywords: params.keywords.join(',') } : {}),
        ...(params.foods?.length ? { foods: params.foods.join(',') } : {}),
        ...(params.page_size ? { page_size: params.page_size } : {}),
        ...(params.rating !== undefined ? { rating: params.rating } : {}),
        ...(params.cooking_time__lte !== undefined
          ? { cooking_time__lte: params.cooking_time__lte }
          : {}),
        ...(params.new ? buildRecentlyAddedRecipeParams() : {}),
        ...(params.sort_order ? { sort_order: params.sort_order } : {}),
        page: pageParam as number,
      }),
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    initialPageParam: 1,
  });
}
