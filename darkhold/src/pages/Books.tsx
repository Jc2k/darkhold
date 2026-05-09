import { useMemo } from 'react';
import { Row, Col, Alert } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { RecipeBook, RecipeBookEntry, Recipe, PaginatedResponse } from '../api/tandoor-types';
import { BookCard } from '../components/BookCard';
import { LoadingMascot } from '../components/LoadingMascot';
import { getFilterId } from '../utils/bookUtils';

async function fetchAllBooks(): Promise<RecipeBook[]> {
  const all: RecipeBook[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBook>>('/recipe-book/', {
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

async function fetchAllBookEntries(): Promise<RecipeBookEntry[]> {
  const all: RecipeBookEntry[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBookEntry>>('/recipe-book-entry/', {
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

export function Books() {
  const {
    data: books,
    isLoading: booksLoading,
    isError: booksError,
  } = useQuery({
    queryKey: ['books'],
    queryFn: fetchAllBooks,
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['book-entries'],
    queryFn: fetchAllBookEntries,
  });

  const coverImages = useMemo(() => {
    if (!entries) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const entry of entries) {
      const bookId = typeof entry.book === 'object' ? entry.book.id : entry.book;
      const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
      if (!map.has(bookId) && recipe?.image) {
        map.set(bookId, recipe.image);
      }
    }
    return map;
  }, [entries]);

  const booksWithFilter = useMemo(() => books?.filter((b) => b.filter != null) ?? [], [books]);

  const { data: filterCovers } = useQuery({
    queryKey: ['book-filter-covers', booksWithFilter.map((b) => b.id)],
    queryFn: async () => {
      const map = new Map<number, string>();
      await Promise.all(
        booksWithFilter.map(async (book) => {
          const filterId = getFilterId(book.filter);
          if (filterId === null) return;
          const data = await apiGet<PaginatedResponse<Recipe>>('/recipe/', {
            keywords: filterId,
            page_size: 1,
          });
          const image = data.results[0]?.image;
          if (image) map.set(book.id, image);
        }),
      );
      return map;
    },
    enabled: booksWithFilter.length > 0,
  });

  const isLoading = booksLoading || entriesLoading;

  if (isLoading && !books) {
    return <LoadingMascot label="Loading books…" />;
  }

  if (booksError) {
    return <Alert variant="danger">Failed to load books. Check your API token in Settings.</Alert>;
  }

  return (
    <div>
      <h2 className="mb-3">Books</h2>

      {books && books.length === 0 && (
        <p className="text-muted text-center py-5">No books found.</p>
      )}

      <Row xs={2} md={3} lg={4} className="g-3">
        {books?.map((book) => {
          const cover = coverImages.get(book.id) ?? filterCovers?.get(book.id) ?? null;
          return (
            <Col key={book.id}>
              <BookCard book={book} coverImage={cover} />
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
