import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRecipeCreationDateScript,
  downloadRecipeCreationDateScript,
} from './recipeCreationDateScript';

const candidates = [
  {
    recipeId: 12,
    recipeName: 'Soup',
    currentCreatedAt: '2026-02-01T12:00:00Z',
    proposedCreatedAt: '2026-01-05T18:30:00Z',
  },
];

describe('recipe creation date script', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a dry-run Django script with optimistic timestamp checks', () => {
    const script = buildRecipeCreationDateScript(candidates);

    expect(script).toContain('APPLY = False');
    expect(script).toContain('[\n        12,');
    expect(script).toContain('"2026-02-01T12:00:00Z"');
    expect(script).toContain('"2026-01-05T18:30:00Z"');
    expect(script).toContain('with scopes_disabled(), transaction.atomic():');
    expect(script).toContain('Recipe.objects.filter(pk=recipe_id, created_at=expected).update(');
    expect(script).toContain('transaction.set_rollback(True)');
  });

  it('downloads the generated script as a Python file', () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:repair-script');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({ click } as any);

    downloadRecipeCreationDateScript(candidates);

    expect(createElement).toHaveBeenCalledWith('a');
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:repair-script');
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/x-python;charset=utf-8');
  });
});
