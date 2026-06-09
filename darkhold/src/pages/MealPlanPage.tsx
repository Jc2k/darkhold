import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  ButtonGroup,
  InputGroup,
  Modal,
  Form,
  Spinner,
  Alert,
  Badge,
} from 'react-bootstrap';
import { AsyncTypeahead } from 'react-bootstrap-typeahead';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import {
  Trash3,
  Plus,
  Check2Circle,
  PencilSquare,
  SunFill,
  CloudSunFill,
  CloudFill,
  CloudRainFill,
  CloudSnowFill,
  CloudLightningRainFill,
  CloudFog2Fill,
  Stars,
  Magic,
  CalendarDate,
  EggFried,
} from 'react-bootstrap-icons';
import { proxyMediaUrl } from '../utils/mediaUrl';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type Collision,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  MEAL_PLAN_ITEM_QUERY_PARAMS,
  useMealPlan,
  useDeleteMealPlan,
  useCreateMealPlan,
  useUpdateMealPlan,
} from '../hooks/useMealPlan';
import {
  useCalendarEvents,
  formatEventTimeRange,
  useRefetchCalendarEvents,
} from '../hooks/useCalendarEvents';
import type { CalendarEventsByDate, CalendarEvent } from '../hooks/useCalendarEvents';
import {
  getWeatherDisruptionBand,
  useRefetchWeatherForecast,
  useWeatherForecast,
} from '../hooks/useWeatherForecast';
import type {
  WeatherByDate,
  WeatherDayForecast,
  WeatherDisruptionBand,
} from '../hooks/useWeatherForecast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../api/client';
import { invalidateCacheQueries } from '../hooks/useCacheInvalidation';
import type {
  MealPlan,
  Recipe,
  MealType,
  PaginatedResponse,
  RecipeIngredient,
  Food,
} from '../api/tandoor-types';
import { deriveMealType } from '../utils/mealUtils';
import { removeMealPlanFromCaches } from '../utils/mealPlanCache';
import {
  formatDate,
  formatMonthYear,
  getMealPlanWeekStartSaturday,
  getWeekStartingSaturday,
  parseLocalDate,
} from '../utils/dateUtils';
import { LoadingMascot } from '../components/LoadingMascot';
import { NoTokenAlert } from '../components/NoTokenAlert';
import { CookLogModal } from '../components/CookLogModal';
import { useCookLog, isCookedOnDate, type CookedByDate } from '../hooks/useCookLog';
import { smallCircleButtonStyle } from '../utils/buttonStyles';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { DroppableTableRow } from './DroppableTableRow';
import {
  buildMealAssistantPlan,
  getCalendarEventDatesByCategory,
  type MealAssistantSlotPlan,
  swapMealAssistantSelection,
} from '../utils/mealPlanningAssistant';
import { getMealPlanningAssistantDataQueryOptions } from '../hooks/useMealPlanningAssistantData';
import {
  getShoppingListEntriesQueryOptions,
  type ShoppingListEntry,
} from '../hooks/useShoppingListEntries';
import { MealPlanAssistantModal } from '../components/MealPlanAssistantModal';
import { useAppConfig } from '../hooks/useAppConfig';
import {
  invalidateAndRefreshMealPlanRedirectWeek,
  MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
} from '../utils/mealPlanRedirect';

type WithSortable = { sortable?: { containerId: string } } | undefined;
type LastOverSnapshot = {
  id: string | number;
  sortableContainerId: string | null;
};

const noop = () => {};

const navButtonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  fontSize: '1.5rem',
  lineHeight: 1,
  padding: '0 0.5rem',
};

const compactTitleButtonSizePx = 24;
const compactTitleButtonFontSize = '0.875rem';
const circleButtonStyle = smallCircleButtonStyle;
const compactTitleButtonStyle: React.CSSProperties = {
  ...smallCircleButtonStyle,
  width: compactTitleButtonSizePx,
  height: compactTitleButtonSizePx,
  fontSize: compactTitleButtonFontSize,
};

type WeekSwipeDirection = -1 | 1;

const MEAL_PLAN_WEEK_SWIPE_MAX_WIDTH_PX = 575.98;
const MEAL_PLAN_WEEK_SWIPE_MIN_DISTANCE_PX = 64;
const MEAL_PLAN_WEEK_SWIPE_HORIZONTAL_RATIO = 1.35;
const MEAL_PLAN_WEEK_SWIPE_INTENT_DISTANCE_PX = 8;
const MEAL_PLAN_WEEK_SWIPE_INTENT_RATIO = 1.1;
const MEAL_PLAN_WEEK_SWIPE_ANIMATION_MS = 180;

interface WeekSwipeCoordinates {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface WeekSwipeGesture extends WeekSwipeCoordinates {
  hasHorizontalIntent: boolean;
}

interface WeekSwipeViewState {
  translateX: number;
  isDragging: boolean;
  isAnimating: boolean;
}

export function getWeekSwipeDirection({
  startX,
  startY,
  endX,
  endY,
}: WeekSwipeCoordinates): WeekSwipeDirection | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (
    absX < MEAL_PLAN_WEEK_SWIPE_MIN_DISTANCE_PX ||
    absX < absY * MEAL_PLAN_WEEK_SWIPE_HORIZONTAL_RATIO
  ) {
    return null;
  }

  return deltaX < 0 ? 1 : -1;
}

function supportsMobileWeekSwipe(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(`(max-width: ${MEAL_PLAN_WEEK_SWIPE_MAX_WIDTH_PX}px)`).matches;
}

function shouldIgnoreWeekSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], .meal-plan-entry-thumb-slot, [data-no-week-swipe]',
    ),
  );
}

/**
 * Use dedicated mouse + touch sensors to avoid iPad Safari touch drags being
 * treated as PointerSensor interactions, which were unreliable across days/types.
 */
export function useMealPlanSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );
}

function ThumbnailPlaceholder({
  dragProps,
}: {
  dragProps?: React.HTMLAttributes<HTMLDivElement> & {
    ref?: React.Ref<HTMLDivElement>;
  };
}) {
  const { style: dragStyle, ...restDragProps } = dragProps ?? {};
  return (
    <div
      role="img"
      aria-label="No image available"
      className="recipe-image-placeholder"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        ...dragStyle,
      }}
      {...restDragProps}
    >
      <EggFried size={22} aria-hidden="true" />
    </div>
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const MEAL_PLAN_PICKER_START_YEAR = 2010;
const MEAL_PLAN_PICKER_FUTURE_YEAR_OFFSET = 1;

export function getMealPlanPickerRange(today: Date): { startMonth: Date; endMonth: Date } {
  const currentYear = today.getFullYear();
  return {
    startMonth: new Date(MEAL_PLAN_PICKER_START_YEAR, 0, 1),
    endMonth: new Date(currentYear + MEAL_PLAN_PICKER_FUTURE_YEAR_OFFSET, 11, 31),
  };
}

export function getMealPlanRouteFromDate(value: string): string | null {
  const selectedDate = parseLocalDate(value);
  if (!selectedDate) return null;
  return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(selectedDate))}`;
}

function shortDay(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function weatherIconForCode(code: number) {
  if (code === 95 || code === 96 || code === 99)
    return <CloudLightningRainFill size={14} aria-hidden="true" />;
  if (
    code === 51 ||
    code === 53 ||
    code === 55 ||
    code === 56 ||
    code === 57 ||
    code === 61 ||
    code === 63 ||
    code === 65 ||
    code === 66 ||
    code === 67 ||
    code === 80 ||
    code === 81 ||
    code === 82
  )
    return <CloudRainFill size={14} aria-hidden="true" />;
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) {
    return <CloudSnowFill size={14} aria-hidden="true" />;
  }
  if (code === 45 || code === 48) return <CloudFog2Fill size={14} aria-hidden="true" />;
  if (code === 0) return <SunFill size={14} aria-hidden="true" />;
  if (code === 1 || code === 2) return <CloudSunFill size={14} aria-hidden="true" />;
  return <CloudFill size={14} aria-hidden="true" />;
}

function weatherSummaryForCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1 || code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return 'Drizzle';
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return 'Rain';
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86)
    return 'Snow';
  if (code === 80 || code === 81 || code === 82) return 'Rain showers';
  if (code === 95 || code === 96 || code === 99) return 'Thunderstorm';
  return 'Mixed weather';
}

function formatWeatherTime(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (isNaN(parsed.getTime())) return '--:--';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function weatherDisruptionLabel(band: WeatherDisruptionBand): string {
  if (band === 'definitely_disrupted') return 'Definitely disrupted';
  if (band === 'might_be_disrupted') return 'Might be disrupted';
  return 'OK';
}

function weatherDisruptionClassName(band: WeatherDisruptionBand): string {
  if (band === 'definitely_disrupted') return 'text-danger';
  if (band === 'might_be_disrupted') return 'text-warning';
  return 'text-success';
}

interface DayCalendarWeatherInfoProps {
  dayEvents: CalendarEvent[];
  weather?: WeatherDayForecast;
  centered?: boolean;
}

function DayCalendarWeatherInfo({ dayEvents, weather, centered }: DayCalendarWeatherInfoProps) {
  if (!weather && dayEvents.length === 0) return null;
  const disruptionBand = weather ? getWeatherDisruptionBand(weather) : null;
  return (
    <div
      className={`text-muted ${centered ? 'text-center' : ''}`}
      style={{ fontSize: '0.7rem', lineHeight: 1.5 }}
    >
      {weather && (
        <div className="mb-1">
          <div
            className="meal-plan-weather-line d-flex align-items-center gap-1"
            style={{ justifyContent: centered ? 'center' : undefined }}
          >
            {weatherIconForCode(weather.weatherCode)}
            <span>{weatherSummaryForCode(weather.weatherCode)}</span>
            <span>
              {Math.round(weather.tempMinC)}-{Math.round(weather.tempMaxC)}°C
            </span>
          </div>
          <div className="meal-plan-weather-sun">
            Sunrise {formatWeatherTime(weather.sunrise)} · Sunset{' '}
            {formatWeatherTime(weather.sunset)}
          </div>
          {disruptionBand && (
            <div
              className={weatherDisruptionClassName(disruptionBand)}
              aria-label={`${weatherDisruptionLabel(disruptionBand)}: precipitation probability ${Math.round(weather.precipitationProbabilityMax)} percent, expected rainfall ${weather.precipitationSumMm.toFixed(1)} millimeters`}
            >
              {weatherDisruptionLabel(disruptionBand)} (
              <span title="precipitation probability / expected rainfall">
                {Math.round(weather.precipitationProbabilityMax)}% /{' '}
                {weather.precipitationSumMm.toFixed(1)} mm
              </span>
              )
            </div>
          )}
        </div>
      )}
      {dayEvents.map((event, idx) => {
        const timeRange = formatEventTimeRange(event);
        return (
          <div key={idx}>
            {event.name}
            {timeRange && <span> ({timeRange})</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Container IDs come in two forms:
 *   - card view:  "YYYY-MM-DD"          (no meal type)
 *   - table view: "YYYY-MM-DD__<id>"    (date + meal type ID separated by "__")
 */
function parseContainerId(id: string): {
  date: string;
  mealTypeId: number | null;
} {
  const sep = id.indexOf('__');
  if (sep === -1) return { date: id, mealTypeId: null };
  const parsed = parseInt(id.slice(sep + 2), 10);
  return { date: id.slice(0, sep), mealTypeId: isNaN(parsed) ? null : parsed };
}

export function getDateMealTypeCollisionId(
  dateKey: string,
  activeContainerId: string,
  collisions?: Collision[] | null,
): string | null {
  if (!collisions || collisions.length === 0) return null;
  const prefix = `${dateKey}__`;
  const ids = collisions
    .map((collision) => String(collision.id))
    .filter((id) => id.startsWith(prefix) && id !== activeContainerId);
  if (ids.length > 0) return ids[0];
  return (
    collisions.map((collision) => String(collision.id)).find((id) => id.startsWith(prefix)) ?? null
  );
}

function getSortableContainerId(dataCurrent: unknown): string | null {
  return (dataCurrent as WithSortable)?.sortable?.containerId ?? null;
}

interface ResolveDropTargetContainerIdArgs {
  overId: string | number;
  activeContainerId: string;
  collisions?: Collision[] | null;
  overSortableContainerId?: string | null;
  fallbackSortableContainerId?: string | null;
}

export function resolveDropTargetContainerId({
  overId,
  activeContainerId,
  collisions,
  overSortableContainerId,
  fallbackSortableContainerId,
}: ResolveDropTargetContainerIdArgs): string | null {
  if (typeof overId === 'string') {
    let targetContainerId = overId;
    const { date, mealTypeId } = parseContainerId(targetContainerId);
    if (mealTypeId == null) {
      const collisionTargetId = getDateMealTypeCollisionId(date, activeContainerId, collisions);
      if (collisionTargetId) {
        targetContainerId = collisionTargetId;
      }
    }
    return targetContainerId;
  }

  return overSortableContainerId ?? fallbackSortableContainerId ?? null;
}

export function getEmptyWeekendLunchDates(
  days: Date[],
  byDayAndMealType: Record<string, Record<number, MealPlan[]>>,
  lunchMealTypeId: number | undefined,
  holidayDates: readonly string[] = [],
): string[] {
  if (!lunchMealTypeId) return [];
  const holidaySet = new Set(holidayDates);
  return days
    .filter((day) => {
      const dayNumber = day.getDay();
      if (dayNumber === 0 || dayNumber === 6) return true;
      const date = formatDate(day);
      return holidaySet.has(date);
    })
    .map((day) => formatDate(day))
    .filter((date) => (byDayAndMealType[date]?.[lunchMealTypeId] ?? []).length === 0);
}

export function buildMealPlanByDayAndMealType(
  days: Date[],
  mealTypes: MealType[],
  entries: MealPlan[],
  pendingMoves: Map<number, string> = new Map(),
): Record<string, Record<number, MealPlan[]>> {
  const byDayAndMealType = days.reduce<Record<string, Record<number, MealPlan[]>>>((acc, day) => {
    const dateKey = formatDate(day);
    acc[dateKey] = {};
    for (const mealType of mealTypes) acc[dateKey][mealType.id] = [];
    return acc;
  }, {});

  for (const entry of entries) {
    const pendingTarget = pendingMoves.get(entry.id);
    let effectiveDate: string;
    let effectiveMealTypeId: number;
    if (pendingTarget) {
      const { date, mealTypeId: pendingMealTypeId } = parseContainerId(pendingTarget);
      effectiveDate = date;
      effectiveMealTypeId =
        pendingMealTypeId ??
        (typeof entry.meal_type === 'object' ? entry.meal_type.id : entry.meal_type);
    } else {
      effectiveDate = entry.from_date.split('T')[0];
      effectiveMealTypeId =
        typeof entry.meal_type === 'object' ? entry.meal_type.id : entry.meal_type;
    }
    byDayAndMealType[effectiveDate]?.[effectiveMealTypeId]?.push(entry);
  }

  return byDayAndMealType;
}

interface PersistedMealAssistantSession {
  assistantMode: boolean;
  assistantEntryPlans: Record<number, MealAssistantSlotPlan>;
}

const MEAL_ASSISTANT_STORAGE_PREFIX = 'meal-plan-assistant:';

function mealAssistantStorageKey(weekStart: string): string {
  return `${MEAL_ASSISTANT_STORAGE_PREFIX}${weekStart}`;
}

function clearMealAssistantSessionsExcept(weekStart: string): void {
  const keyToKeep = mealAssistantStorageKey(weekStart);
  const keysToDelete: string[] = [];
  for (let storageIndex = 0; storageIndex < localStorage.length; storageIndex += 1) {
    const key = localStorage.key(storageIndex);
    if (!key || !key.startsWith(MEAL_ASSISTANT_STORAGE_PREFIX) || key === keyToKeep) continue;
    keysToDelete.push(key);
  }
  keysToDelete.forEach((key) => localStorage.removeItem(key));
}

function clearMealAssistantSession(weekStart: string): void {
  localStorage.removeItem(mealAssistantStorageKey(weekStart));
}

function loadMealAssistantSession(weekStart: string): PersistedMealAssistantSession | null {
  try {
    const raw = localStorage.getItem(mealAssistantStorageKey(weekStart));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedMealAssistantSession;
  } catch {
    return null;
  }
}

function saveMealAssistantSession(
  weekStart: string,
  session: PersistedMealAssistantSession | null,
): void {
  const key = mealAssistantStorageKey(weekStart);
  if (!session || !session.assistantMode || Object.keys(session.assistantEntryPlans).length === 0) {
    clearMealAssistantSession(weekStart);
    return;
  }
  clearMealAssistantSessionsExcept(weekStart);
  localStorage.setItem(key, JSON.stringify(session));
}

export function shoppingListHasCurrentWeekEntries(
  entries: ShoppingListEntry[],
  weekStart: string,
  weekEnd: string,
): boolean {
  return entries.some((entry) => {
    const fromDate = entry.list_recipe_data?.meal_plan_data?.from_date;
    const date = fromDate?.split('T')[0];
    if (!date) return false;
    return date >= weekStart && date <= weekEnd;
  });
}

export function shouldClearAssistantSessionFromShoppingList(
  entries: ShoppingListEntry[],
  weekStart: string,
  weekEnd: string,
  options?: { isPlanning?: boolean; isRefreshing?: boolean },
): boolean {
  if (options?.isPlanning || options?.isRefreshing) return false;
  if (entries.length === 0) return true;
  return !shoppingListHasCurrentWeekEntries(entries, weekStart, weekEnd);
}

function updateMealPlanWeekCache(
  queryClient: ReturnType<typeof useQueryClient>,
  weekStart: Date,
  weekEnd: Date,
  entry: MealPlan,
): void {
  queryClient.setQueryData<PaginatedResponse<MealPlan>>(
    ['meal-plan', formatDate(weekStart), formatDate(weekEnd)],
    (current) => {
      if (!current) return current;
      const existingIndex = current.results.findIndex((candidate) => candidate.id === entry.id);
      if (existingIndex === -1) {
        return {
          ...current,
          count: current.count + 1,
          results: [...current.results, entry],
        };
      }

      const nextResults = current.results.slice();
      nextResults[existingIndex] = entry;
      return { ...current, results: nextResults };
    },
  );
}

interface EntryCardProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onClick: (entry: MealPlan) => void;
  onEdit?: (entry: MealPlan) => void;
  dragging?: boolean;
  isCooked?: boolean;
  onLogCook?: (entry: MealPlan) => void;
  assistantEnabled?: boolean;
  assistantPlan?: MealAssistantSlotPlan;
  onShowAssistant?: (entry: MealPlan) => void;
}

interface CompactEntryActionsProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onEdit?: (entry: MealPlan) => void;
  showPrimaryLogAction: boolean;
  onLogCook?: (entry: MealPlan) => void;
  assistantEnabled?: boolean;
  onShowAssistant?: (entry: MealPlan) => void;
}

function CompactEntryActions({
  entry,
  onDelete,
  onEdit,
  showPrimaryLogAction,
  onLogCook,
  assistantEnabled,
  onShowAssistant,
}: CompactEntryActionsProps) {
  return (
    <div
      className="meal-plan-entry-actions meal-plan-entry-actions--compact"
      onClick={(e) => e.stopPropagation()}
    >
      {showPrimaryLogAction && (
        <Button
          variant="outline-secondary"
          size="sm"
          style={compactTitleButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            onLogCook?.(entry);
          }}
          aria-label="Log as cooked"
        >
          <Check2Circle size={14} />
        </Button>
      )}
      {assistantEnabled && onShowAssistant && (
        <Button
          variant="outline-warning"
          size="sm"
          style={compactTitleButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            onShowAssistant(entry);
          }}
          aria-label="Explain assisted meal"
        >
          <Stars size={14} />
        </Button>
      )}
      {onEdit && (
        <Button
          variant="outline-secondary"
          size="sm"
          style={compactTitleButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(entry);
          }}
          aria-label="Edit meal"
        >
          <PencilSquare size={14} />
        </Button>
      )}
      <Button
        variant="danger"
        size="sm"
        style={compactTitleButtonStyle}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry.id);
        }}
        aria-label="Remove meal"
      >
        <Trash3 size={14} />
      </Button>
    </div>
  );
}

function EntryCard({
  entry,
  onDelete,
  onClick,
  onEdit,
  dragging,
  isCooked,
  onLogCook,
  assistantEnabled,
  assistantPlan,
  onShowAssistant,
}: EntryCardProps) {
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const thumbnailSrc = recipe?.image ? proxyMediaUrl(recipe.image) : undefined;
  const titleText = recipe?.name ?? `Recipe #${entry.recipe}`;
  const showPrimaryLogAction = Boolean(!isCooked && onLogCook);

  return (
    <Card className={`meal-plan-entry-card border-1 ${dragging ? 'shadow-lg' : 'shadow-sm'}`}>
      <div className="d-flex meal-plan-entry-body">
        <div className="meal-plan-entry-thumb-slot">
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={recipe?.name ?? ''}
              draggable={false}
              className="meal-plan-entry-thumb"
              style={{
                cursor: dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
            />
          ) : (
            <ThumbnailPlaceholder />
          )}
        </div>
        <div className="meal-plan-entry-content" onClick={() => onClick(entry)}>
          <div
            className="small fw-semibold meal-plan-entry-title bg-body-tertiary"
            title={titleText}
          >
            <span className="meal-plan-entry-title-label">{titleText}</span>
            {!dragging && (
              <CompactEntryActions
                entry={entry}
                onDelete={onDelete}
                onEdit={onEdit}
                showPrimaryLogAction={showPrimaryLogAction}
                onLogCook={onLogCook}
                assistantEnabled={assistantEnabled}
                onShowAssistant={onShowAssistant}
              />
            )}
          </div>
          <div className="meal-plan-entry-details">
            {assistantPlan && <AssistedMealSummary plan={assistantPlan} />}
            {entry.note && (
              <span className="text-muted meal-plan-note-preview" title={entry.note}>
                {entry.note}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

interface SortableEntryProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onClick: (entry: MealPlan) => void;
  onEdit?: (entry: MealPlan) => void;
  isPending?: boolean;
  isCooked?: boolean;
  onLogCook?: (entry: MealPlan) => void;
  assistantEnabled?: boolean;
  assistantPlan?: MealAssistantSlotPlan;
  onShowAssistant?: (entry: MealPlan) => void;
}

function AssistedMealSummary({ plan }: { plan: MealAssistantSlotPlan }) {
  return (
    <div className="meal-plan-assistant-summary">
      <span className="text-muted">Flavour</span>
      <Badge bg="light" text="dark">
        {plan.roleLabel}
      </Badge>
      <span className="text-muted">Score</span>
      <Badge bg="secondary">{plan.selected.score}</Badge>
    </div>
  );
}

function SortableEntry({
  entry,
  onDelete,
  onClick,
  onEdit,
  isPending,
  isCooked,
  onLogCook,
  assistantEnabled,
  assistantPlan,
  onShowAssistant,
}: SortableEntryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const thumbnailSrc = recipe?.image ? proxyMediaUrl(recipe.image) : undefined;
  const titleText = recipe?.name ?? `Recipe #${entry.recipe}`;
  const showPrimaryLogAction = Boolean(!isCooked && onLogCook);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      className="meal-plan-sortable-entry"
    >
      <div style={{ position: 'relative' }}>
        <Card
          className="meal-plan-entry-card border-1 shadow-sm"
          style={isPending ? { opacity: 0.55 } : undefined}
        >
          <div className="d-flex meal-plan-entry-body">
            <div className="meal-plan-entry-thumb-slot">
              {thumbnailSrc ? (
                <img
                  ref={setActivatorNodeRef}
                  {...listeners}
                  src={thumbnailSrc}
                  alt={recipe?.name ?? ''}
                  draggable={false}
                  className="meal-plan-entry-thumb"
                  style={{ cursor: 'grab', touchAction: 'none' }}
                />
              ) : (
                <ThumbnailPlaceholder
                  dragProps={{
                    ref: setActivatorNodeRef as React.Ref<HTMLDivElement>,
                    ...listeners,
                    style: { cursor: 'grab', touchAction: 'none' },
                  }}
                />
              )}
            </div>
            <div className="meal-plan-entry-content" onClick={() => onClick(entry)}>
              <div
                className="small fw-semibold meal-plan-entry-title bg-body-tertiary"
                title={titleText}
              >
                <span className="meal-plan-entry-title-label">{titleText}</span>
                {!isDragging && (
                  <CompactEntryActions
                    entry={entry}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    showPrimaryLogAction={showPrimaryLogAction}
                    onLogCook={onLogCook}
                    assistantEnabled={assistantEnabled}
                    onShowAssistant={onShowAssistant}
                  />
                )}
              </div>
              <div className="meal-plan-entry-details">
                {assistantPlan && <AssistedMealSummary plan={assistantPlan} />}
                {entry.note && (
                  <span className="text-muted meal-plan-note-preview" title={entry.note}>
                    {entry.note}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
        {isPending && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 4,
              backgroundColor: 'rgba(200, 200, 200, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <Spinner size="sm" variant="secondary" />
          </div>
        )}
      </div>
    </div>
  );
}

interface DroppableDayProps {
  dateKey: string;
  children: React.ReactNode;
}

function DroppableDay({ dateKey, children }: DroppableDayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  return (
    <div
      ref={setNodeRef}
      className="meal-plan-day"
      style={{
        borderRadius: 4,
        backgroundColor: isOver ? 'rgba(13, 110, 253, 0.08)' : undefined,
        transition: 'background-color 0.15s',
      }}
    >
      {children}
    </div>
  );
}

interface EmptyMealCellAddButtonProps {
  dateKey: string;
  mealType: MealType;
  disabled: boolean;
  onAddMeal: (date: string, mealTypeId?: number) => void;
}

function EmptyMealCellAddButton({
  dateKey,
  mealType,
  disabled,
  onAddMeal,
}: EmptyMealCellAddButtonProps) {
  return (
    <Button
      variant="outline-success"
      className="meal-plan-empty-cell-add"
      onClick={() => onAddMeal(dateKey, mealType.id)}
      disabled={disabled}
      aria-label={`Add ${mealType.name} on ${dateKey}`}
    >
      <Plus size={28} aria-hidden="true" />
    </Button>
  );
}

interface AddMealModalProps {
  date: string;
  onHide: () => void;
  mealTypes: MealType[];
  initialMealTypeId?: number;
}

type RecipeSearchOption = Recipe & { customOption?: boolean };

interface SubRecipeLink {
  recipeId: number;
  recipeName: string;
  foodName: string;
}

interface ResolvedRecipeSelection {
  mealTypeId: number | undefined;
  subRecipeLinks: SubRecipeLink[];
}

export function AddMealModal({ date, onHide, mealTypes, initialMealTypeId }: AddMealModalProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [recipeOptions, setRecipeOptions] = useState<RecipeSearchOption[]>([]);
  const [searchError, setSearchError] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSearchOption | null>(null);
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<number | undefined>(undefined);
  const [isResolvingRecipeSelection, setIsResolvingRecipeSelection] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [servings, setServings] = useState(1);
  const [note, setNote] = useState('');
  const createMeal = useCreateMealPlan();
  const queryClient = useQueryClient();
  const defaultMealTypeId = initialMealTypeId ?? mealTypes[0]?.id;
  const [subRecipeLinks, setSubRecipeLinks] = useState<SubRecipeLink[] | null>(null);
  const [subRecipeToggles, setSubRecipeToggles] = useState<Record<number, boolean>>({});
  const recipeSelectionRequestIdRef = useRef(0);
  const recipeSelectionPromiseRef = useRef<Promise<ResolvedRecipeSelection> | null>(null);
  const selectedRecipeRef = useRef<RecipeSearchOption | null>(null);
  const selectedMealTypeIdRef = useRef<number | undefined>(undefined);
  const subRecipeLinksRef = useRef<SubRecipeLink[] | null>(null);
  const subRecipeTogglesRef = useRef<Record<number, boolean>>({});
  useEffect(() => {
    setSelectedMealTypeId((prev) => prev ?? defaultMealTypeId);
  }, [defaultMealTypeId]);
  useEffect(() => {
    selectedRecipeRef.current = selectedRecipe;
  }, [selectedRecipe]);
  useEffect(() => {
    selectedMealTypeIdRef.current = selectedMealTypeId;
  }, [selectedMealTypeId]);
  useEffect(() => {
    subRecipeLinksRef.current = subRecipeLinks;
  }, [subRecipeLinks]);
  useEffect(() => {
    subRecipeTogglesRef.current = subRecipeToggles;
  }, [subRecipeToggles]);

  const handleRecipeSearch = async (query: string) => {
    setIsSearching(true);
    setSearchError(false);
    try {
      const data = await apiGet<PaginatedResponse<Recipe>>('/recipe/', {
        query,
        page_size: 10,
      });
      setRecipeOptions(data.results);
    } catch {
      setSearchError(true);
      setRecipeOptions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectRecipe = async (selected: RecipeSearchOption[]) => {
    const requestId = ++recipeSelectionRequestIdRef.current;
    const r = selected[0] ?? null;
    setSelectedRecipe(r);

    if (!r) {
      recipeSelectionPromiseRef.current = null;
      setIsResolvingRecipeSelection(false);
      setSubRecipeLinks([]);
      setSelectedMealTypeId(initialMealTypeId ?? mealTypes[0]?.id);
      return;
    }

    setServings(r.servings ?? 1);

    if (r.customOption) {
      recipeSelectionPromiseRef.current = Promise.resolve({
        mealTypeId: initialMealTypeId ?? mealTypes[0]?.id,
        subRecipeLinks: [],
      });
      setIsResolvingRecipeSelection(false);
      setSubRecipeLinks([]);
      setSelectedMealTypeId(initialMealTypeId ?? mealTypes[0]?.id);
      return;
    }

    setIsResolvingRecipeSelection(true);
    setSubRecipeLinks(null);
    setSelectedMealTypeId(undefined);

    const resolutionPromise: Promise<ResolvedRecipeSelection> = initialMealTypeId
      ? Promise.resolve({
          mealTypeId: initialMealTypeId,
          subRecipeLinks: [],
        })
      : (async () => {
          const fullRecipe = await apiGet<Recipe>(`/recipe/${r.id}/`);
          const seen = new Set<number>();
          const links: SubRecipeLink[] = [];
          if (fullRecipe?.steps) {
            for (const step of fullRecipe.steps) {
              for (const ing of (step.ingredients ?? []) as RecipeIngredient[]) {
                const food = ing.food && typeof ing.food === 'object' ? (ing.food as Food) : null;
                if (food?.recipe && !seen.has(food.recipe.id)) {
                  seen.add(food.recipe.id);
                  links.push({
                    recipeId: food.recipe.id,
                    recipeName: food.recipe.name,
                    foodName: food.name,
                  });
                }
              }
            }
          }
          return {
            subRecipeLinks: links,
            mealTypeId: deriveMealType(fullRecipe, mealTypes) ?? mealTypes[0]?.id,
          };
        })();
    recipeSelectionPromiseRef.current = resolutionPromise;

    try {
      const resolution = await resolutionPromise;
      if (recipeSelectionRequestIdRef.current !== requestId) return;
      setSubRecipeLinks(resolution.subRecipeLinks);
      setSelectedMealTypeId(resolution.mealTypeId);
    } finally {
      if (recipeSelectionRequestIdRef.current === requestId) {
        setIsResolvingRecipeSelection(false);
      }
    }
  };

  const waitForLatestRecipeSelection = async () => {
    let requestId = recipeSelectionRequestIdRef.current;
    let selectionPromise = recipeSelectionPromiseRef.current;
    if (!selectionPromise) return null;

    let resolution = await selectionPromise;
    while (recipeSelectionRequestIdRef.current !== requestId) {
      requestId = recipeSelectionRequestIdRef.current;
      selectionPromise = recipeSelectionPromiseRef.current;
      if (!selectionPromise) return null;
      resolution = await selectionPromise;
    }
    return resolution;
  };

  // Initialise toggles (all on by default) when sub-recipe list becomes available
  useEffect(() => {
    if (subRecipeLinks?.length === 0) return;
    setSubRecipeToggles((prev) => {
      const next: Record<number, boolean> = {};
      if (subRecipeLinks) {
        for (const link of subRecipeLinks) {
          next[link.recipeId] = prev[link.recipeId] ?? true;
        }
      }
      return next;
    });
  }, [subRecipeLinks]);

  const handleSubmit = async () => {
    if (isSubmitting || !selectedRecipeRef.current) return;

    setIsSubmitting(true);
    try {
      const needsResolution = isResolvingRecipeSelection || !selectedMealTypeIdRef.current;
      const resolvedSelection = needsResolution ? await waitForLatestRecipeSelection() : null;
      if (needsResolution && !resolvedSelection) return;

      const resolvedRecipe = selectedRecipeRef.current;
      const resolvedMealTypeId = selectedMealTypeIdRef.current ?? resolvedSelection?.mealTypeId;
      const resolvedSubRecipeLinks =
        subRecipeLinksRef.current ?? resolvedSelection?.subRecipeLinks ?? [];
      if (!resolvedRecipe || !resolvedMealTypeId) return;

      const mealPlanRecipe = resolvedRecipe.customOption
        ? await apiPost<Recipe>('/recipe/', {
            name: resolvedRecipe.name.trim(),
            servings,
            steps: [],
          })
        : resolvedRecipe;

      if (resolvedRecipe.customOption) {
        setRecipeOptions((current) => [mealPlanRecipe, ...current]);
        invalidateCacheQueries(queryClient, 'recipes', 'all-recipes', 'recipe');
      }

      await createMeal.mutateAsync({
        recipe: mealPlanRecipe.id as unknown as Recipe,
        meal_type: resolvedMealTypeId as unknown as MealType,
        from_date: date,
        servings,
        ...(note ? { note } : {}),
        addshopping: true,
      });
      if (resolvedSubRecipeLinks.length > 0) {
        const toggles = subRecipeTogglesRef.current;
        await Promise.all(
          resolvedSubRecipeLinks
            .filter((link) => toggles[link.recipeId])
            .map((link) =>
              createMeal.mutateAsync({
                recipe: link.recipeId as unknown as Recipe,
                meal_type: resolvedMealTypeId as unknown as MealType,
                from_date: date,
                servings: 1,
                addshopping: true,
              }),
            ),
        );
      }
      onHide();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">Add Meal — {date}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Search Recipe</Form.Label>
          <AsyncTypeahead
            id="add-meal-recipe-search"
            isLoading={isSearching}
            labelKey="name"
            minLength={1}
            allowNew={(results, state) => results.length === 0 && state.text.trim().length > 0}
            newSelectionPrefix="Create new recipe: "
            options={recipeOptions}
            selected={selectedRecipe ? [selectedRecipe] : []}
            onSearch={handleRecipeSearch}
            onChange={(opts) => {
              void handleSelectRecipe(opts as RecipeSearchOption[]).catch((error) => {
                console.warn('Failed to resolve meal type for selected recipe', error);
              });
            }}
            placeholder="Type to search…"
          />
          {selectedRecipe?.customOption && (
            <Alert variant="info" className="py-1 px-2 mt-1 mb-0 small">
              A new placeholder recipe named “{selectedRecipe.name}” will be created when you add it
              to the meal plan.
            </Alert>
          )}
          {searchError && (
            <Alert variant="danger" className="py-1 px-2 mt-1 mb-0 small">
              Failed to load recipes.
            </Alert>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Servings</Form.Label>
          <InputGroup>
            <Button
              className="px-3"
              variant="outline-secondary"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="Decrease servings"
            >
              -
            </Button>
            <Form.Control
              type="text"
              inputMode="numeric"
              value={servings}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) setServings(val);
                else if (e.target.value === '') setServings(1);
              }}
              style={{ textAlign: 'center' }}
            />
            <Button
              className="px-3"
              variant="outline-secondary"
              onClick={() => setServings((s) => s + 1)}
              aria-label="Increase servings"
            >
              +
            </Button>
          </InputGroup>
        </Form.Group>

        <Form.Group>
          <Form.Label>Notes</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional notes…"
          />
        </Form.Group>

        {subRecipeLinks === null && <Spinner size="sm" />}

        {subRecipeLinks && subRecipeLinks.length > 0 && (
          <div className="mb-3">
            {subRecipeLinks.map((link) => (
              <Form.Check
                key={link.recipeId}
                type="switch"
                id={`sub-recipe-${link.recipeId}`}
                label={`Are you making ${link.foodName} from scratch?`}
                checked={subRecipeToggles[link.recipeId] ?? false}
                onChange={(e) => {
                  setSubRecipeToggles((prev) => ({
                    ...prev,
                    [link.recipeId]: e.target.checked,
                  }));
                }}
              />
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="success"
          disabled={
            !selectedRecipe ||
            isSubmitting ||
            createMeal.isPending ||
            (!isResolvingRecipeSelection && !selectedMealTypeId)
          }
          onClick={handleSubmit}
        >
          {isSubmitting || createMeal.isPending ? <Spinner size="sm" /> : 'Add'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

interface EditMealModalProps {
  entry: MealPlan;
  onHide: () => void;
}

function EditMealModal({ entry, onHide }: EditMealModalProps) {
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const [servings, setServings] = useState<number>(entry.servings ?? 1);
  const [note, setNote] = useState<string>(entry.note ?? '');
  const updateMeal = useUpdateMealPlan();

  // Initialise the week picker to the week that contains the entry's current date.
  const initialWeekOffset = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilSat = (6 - today.getDay() + 7) % 7;
    const baseSat = new Date(today);
    baseSat.setDate(today.getDate() + daysUntilSat);
    const [y, m, d] = entry.from_date.split('T')[0].split('-').map(Number);
    const entryDate = new Date(y, m - 1, d);
    entryDate.setHours(0, 0, 0, 0);
    const daysSinceSat = (entryDate.getDay() - 6 + 7) % 7;
    const entrySat = new Date(entryDate);
    entrySat.setDate(entryDate.getDate() - daysSinceSat);
    return Math.round((entrySat.getTime() - baseSat.getTime()) / (7 * 24 * 60 * 60 * 1000));
  })();

  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const days = getWeekStartingSaturday(weekOffset);
  const [selectedDate, setSelectedDate] = useState<string>(entry.from_date.split('T')[0]);

  const handleSubmit = async () => {
    const recipeId = typeof entry.recipe === 'object' ? entry.recipe.id : entry.recipe;
    const mealTypeId = typeof entry.meal_type === 'object' ? entry.meal_type.id : entry.meal_type;
    await updateMeal.mutateAsync({
      id: entry.id,
      data: {
        recipe: recipeId as unknown as Recipe,
        meal_type: mealTypeId as unknown as MealType,
        from_date: selectedDate,
        to_date: selectedDate,
        servings,
        note,
      },
    });
    onHide();
  };

  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title
          className="fs-6"
          style={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          Edit "{recipe?.name ?? `Recipe #${entry.recipe}`}"
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Date</Form.Label>
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-muted small">{formatMonthYear(days[0])}</span>
          </div>
          <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Previous week"
            >
              ‹
            </Button>
            {days.map((d) => (
              <Button
                key={d.toISOString()}
                size="sm"
                variant={formatDate(d) === selectedDate ? 'primary' : 'outline-secondary'}
                onClick={() => setSelectedDate(formatDate(d))}
                className="d-flex flex-column align-items-center px-2 py-1 flex-fill"
                style={{ minWidth: 0 }}
              >
                <span style={{ fontSize: '0.65rem', lineHeight: 1 }}>
                  {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span
                  style={{
                    fontSize: '0.85rem',
                    lineHeight: 1.2,
                    fontWeight: 600,
                  }}
                >
                  {d.getDate()}
                </span>
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Next week"
            >
              ›
            </Button>
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Servings</Form.Label>
          <InputGroup>
            <Button
              className="px-3"
              variant="outline-secondary"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="Decrease servings"
            >
              -
            </Button>
            <Form.Control
              type="text"
              inputMode="numeric"
              value={servings}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) setServings(val);
                else if (e.target.value === '') setServings(1);
              }}
              style={{ textAlign: 'center' }}
            />
            <Button
              className="px-3"
              variant="outline-secondary"
              onClick={() => setServings((s) => s + 1)}
              aria-label="Increase servings"
            >
              +
            </Button>
          </InputGroup>
        </Form.Group>

        <Form.Group>
          <Form.Label>Notes</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional notes…"
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={updateMeal.isPending}>
          {updateMeal.isPending ? <Spinner size="sm" /> : 'Save'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

interface MealPlanTableViewProps {
  days: Date[];
  mealTypes: MealType[];
  byDayAndMealType: Record<string, Record<number, MealPlan[]>>;
  todayStr: string;
  pendingMoves: Map<number, string>;
  hasPersonalToken: boolean;
  onDelete: (id: number) => void;
  onEntryClick: (entry: MealPlan) => void;
  onAddMeal: (date: string, mealTypeId?: number) => void;
  onLogCook: (entry: MealPlan) => void;
  onEdit: (entry: MealPlan) => void;
  cookLogData: CookedByDate | undefined;
  calendarEventsByDate?: CalendarEventsByDate;
  weatherByDate?: WeatherByDate;
  assistantMode: boolean;
  assistedEntryIds: Set<number>;
  assistantEntryPlans: Record<number, MealAssistantSlotPlan>;
  onShowAssistant: (entry: MealPlan) => void;
}

function MealPlanTableView({
  days,
  mealTypes,
  byDayAndMealType,
  todayStr,
  pendingMoves,
  hasPersonalToken,
  onDelete,
  onEntryClick,
  onAddMeal,
  onLogCook,
  onEdit,
  cookLogData,
  calendarEventsByDate,
  weatherByDate,
  assistantMode,
  assistedEntryIds,
  assistantEntryPlans,
  onShowAssistant,
}: MealPlanTableViewProps) {
  return (
    <div className="meal-plan-table-shell">
      <div style={{ overflowX: 'auto' }}>
        <Table bordered size="sm" className="meal-plan-table mb-0 w-100">
          <colgroup>
            <col style={{ width: '12%' }} />
            {mealTypes.map((mt) => (
              <col key={mt.id} />
            ))}
            {(calendarEventsByDate || weatherByDate) && <col style={{ width: '24%' }} />}
          </colgroup>
          <thead>
            <tr className="meal-plan-table-header-row">
              <th className="py-2 ps-2 text-muted fw-semibold" style={{ fontSize: '0.75rem' }}>
                Day
              </th>
              {mealTypes.map((mt) => (
                <th key={mt.id} className="py-2 ps-2 fw-semibold" style={{ fontSize: '0.75rem' }}>
                  {mt.name}
                </th>
              ))}
              {(calendarEventsByDate || weatherByDate) && (
                <th className="py-2 ps-2 text-muted fw-semibold" style={{ fontSize: '0.75rem' }}>
                  Weather & events
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dateKey = formatDate(day);
              const isToday = dateKey === todayStr;
              const isPastOrToday = dateKey <= todayStr;
              const dayEvents = calendarEventsByDate?.[dateKey] ?? [];
              const dayWeather = weatherByDate?.[dateKey];
              return (
                <DroppableTableRow
                  key={dateKey}
                  dateKey={dateKey}
                  className={`meal-plan-mobile-row meal-plan-table-data-row ${isToday ? 'table-primary' : ''}`}
                >
                  <td
                    className={`meal-plan-mobile-cell py-2 px-2 align-top ${isToday ? 'bg-primary text-white' : 'bg-body-tertiary'}`}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <small className="fw-semibold" style={{ whiteSpace: 'nowrap' }}>
                        {shortDay(day)}
                      </small>
                      <Button
                        variant={isToday ? 'light' : 'outline-success'}
                        size="sm"
                        style={circleButtonStyle}
                        onClick={() => onAddMeal(dateKey)}
                        disabled={!hasPersonalToken}
                        aria-label={`Add meal on ${dateKey}`}
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                  </td>
                  {mealTypes.map((mt) => {
                    const containerId = `${dateKey}__${mt.id}`;
                    const entries = byDayAndMealType[dateKey]?.[mt.id] ?? [];
                    return (
                      <td
                        key={mt.id}
                        className={`meal-plan-mobile-cell meal-plan-entry-cell align-top ${entries.length === 0 ? 'meal-plan-mobile-empty' : ''}`}
                      >
                        <DroppableDay dateKey={containerId}>
                          {entries.length === 0 && (
                            <EmptyMealCellAddButton
                              dateKey={dateKey}
                              mealType={mt}
                              disabled={!hasPersonalToken}
                              onAddMeal={onAddMeal}
                            />
                          )}
                          <SortableContext id={containerId} items={entries.map((e) => e.id)}>
                            {entries.map((entry) => {
                              const recipeId =
                                typeof entry.recipe === 'object' ? entry.recipe.id : entry.recipe;
                              const cooked =
                                isPastOrToday && isCookedOnDate(cookLogData, recipeId, dateKey);
                              return (
                                <SortableEntry
                                  key={entry.id}
                                  entry={entry}
                                  onDelete={onDelete}
                                  onClick={onEntryClick}
                                  onEdit={onEdit}
                                  isPending={pendingMoves.has(entry.id)}
                                  isCooked={cooked}
                                  onLogCook={isPastOrToday ? onLogCook : undefined}
                                  assistantEnabled={assistantMode && assistedEntryIds.has(entry.id)}
                                  assistantPlan={assistantEntryPlans[entry.id]}
                                  onShowAssistant={onShowAssistant}
                                />
                              );
                            })}
                          </SortableContext>
                        </DroppableDay>
                      </td>
                    );
                  })}
                  {(calendarEventsByDate || weatherByDate) && (
                    <td className="meal-plan-mobile-cell meal-plan-weather-cell align-top">
                      <DayCalendarWeatherInfo dayEvents={dayEvents} weather={dayWeather} />
                    </td>
                  )}
                </DroppableTableRow>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

interface MealPlanWeekViewData {
  days: Date[];
  byDayAndMealType: Record<string, Record<number, MealPlan[]>>;
  pendingMoves?: Map<number, string>;
  cookLogData?: CookedByDate;
  calendarEventsByDate?: CalendarEventsByDate;
  weatherByDate?: WeatherByDate;
  assistantMode?: boolean;
  assistedEntryIds?: Set<number>;
  assistantEntryPlans?: Record<number, MealAssistantSlotPlan>;
}

interface MealPlanWeekCarouselProps {
  previousWeek: MealPlanWeekViewData;
  currentWeek: MealPlanWeekViewData;
  nextWeek: MealPlanWeekViewData;
  mealTypes: MealType[];
  todayStr: string;
  hasPersonalToken: boolean;
  swipeState: WeekSwipeViewState;
  onDelete: (id: number) => void;
  onEntryClick: (entry: MealPlan) => void;
  onAddMeal: (date: string, mealTypeId?: number) => void;
  onLogCook: (entry: MealPlan) => void;
  onEdit: (entry: MealPlan) => void;
  onShowAssistant: (entry: MealPlan) => void;
}

function MealPlanWeekCarousel({
  previousWeek,
  currentWeek,
  nextWeek,
  mealTypes,
  todayStr,
  hasPersonalToken,
  swipeState,
  onDelete,
  onEntryClick,
  onAddMeal,
  onLogCook,
  onEdit,
  onShowAssistant,
}: MealPlanWeekCarouselProps) {
  const commonProps = {
    mealTypes,
    todayStr,
    hasPersonalToken,
    onDelete,
    onEntryClick,
    onAddMeal,
    onLogCook,
    onEdit,
    onShowAssistant,
  };

  const sidePendingMoves = new Map<number, string>();
  const sideAssistedEntryIds = new Set<number>();

  return (
    <div className="meal-plan-week-carousel">
      <div
        className={`meal-plan-week-carousel-track ${swipeState.isDragging ? 'is-dragging' : ''} ${swipeState.isAnimating ? 'is-animating' : ''}`}
        style={{ transform: `translate3d(${swipeState.translateX}px, 0, 0)` }}
      >
        <div className="meal-plan-week-carousel-slide meal-plan-week-carousel-slide--previous">
          <MealPlanTableView
            {...commonProps}
            days={previousWeek.days}
            byDayAndMealType={previousWeek.byDayAndMealType}
            pendingMoves={sidePendingMoves}
            cookLogData={previousWeek.cookLogData}
            calendarEventsByDate={previousWeek.calendarEventsByDate}
            weatherByDate={previousWeek.weatherByDate}
            assistantMode={previousWeek.assistantMode ?? false}
            assistedEntryIds={previousWeek.assistedEntryIds ?? sideAssistedEntryIds}
            assistantEntryPlans={previousWeek.assistantEntryPlans ?? {}}
          />
        </div>
        <div className="meal-plan-week-carousel-slide meal-plan-week-carousel-slide--current">
          <MealPlanTableView
            {...commonProps}
            days={currentWeek.days}
            byDayAndMealType={currentWeek.byDayAndMealType}
            pendingMoves={currentWeek.pendingMoves ?? sidePendingMoves}
            cookLogData={currentWeek.cookLogData}
            calendarEventsByDate={currentWeek.calendarEventsByDate}
            weatherByDate={currentWeek.weatherByDate}
            assistantMode={currentWeek.assistantMode ?? false}
            assistedEntryIds={currentWeek.assistedEntryIds ?? sideAssistedEntryIds}
            assistantEntryPlans={currentWeek.assistantEntryPlans ?? {}}
          />
        </div>
        <div className="meal-plan-week-carousel-slide meal-plan-week-carousel-slide--next">
          <MealPlanTableView
            {...commonProps}
            days={nextWeek.days}
            byDayAndMealType={nextWeek.byDayAndMealType}
            pendingMoves={sidePendingMoves}
            cookLogData={nextWeek.cookLogData}
            calendarEventsByDate={nextWeek.calendarEventsByDate}
            weatherByDate={nextWeek.weatherByDate}
            assistantMode={nextWeek.assistantMode ?? false}
            assistedEntryIds={nextWeek.assistedEntryIds ?? sideAssistedEntryIds}
            assistantEntryPlans={nextWeek.assistantEntryPlans ?? {}}
          />
        </div>
      </div>
    </div>
  );
}

export function MealPlanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { weekStart } = useParams<{ weekStart: string }>();
  const [addModal, setAddModal] = useState<{
    date: string;
    mealTypeId?: number;
  } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [cookLogEntry, setCookLogEntry] = useState<MealPlan | null>(null);
  const [editEntry, setEditEntry] = useState<MealPlan | null>(null);
  const [assistantMode, setAssistantMode] = useState(false);
  const [assistantEntryPlans, setAssistantEntryPlans] = useState<
    Record<number, MealAssistantSlotPlan>
  >({});
  const [assistantModalPlan, setAssistantModalPlan] = useState<MealAssistantSlotPlan | null>(null);
  const [assistantModalEntry, setAssistantModalEntry] = useState<MealPlan | null>(null);
  const [isAssistantSwitching, setIsAssistantSwitching] = useState(false);
  const [assistantFeedback, setAssistantFeedback] = useState<{
    variant: 'info' | 'warning' | 'danger' | 'success';
    message: string;
  } | null>(null);
  const [isAssistantPlanning, setIsAssistantPlanning] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showWeekPickerModal, setShowWeekPickerModal] = useState(false);
  const [pendingPickerDate, setPendingPickerDate] = useState<Date | null>(null);
  const [isClearingWeek, setIsClearingWeek] = useState(false);
  const skipAssistantSessionPersist = useRef(false);
  const lastOverSnapshotRef = useRef<LastOverSnapshot | null>(null);
  const lastActiveContainerIdRef = useRef<string | null>(null);
  const weekSwipeStartRef = useRef<WeekSwipeGesture | null>(null);
  const weekSwipeResetTimeoutRef = useRef<number | null>(null);
  const weekSwipeAreaRef = useRef<HTMLDivElement | null>(null);
  const [weekSwipeState, setWeekSwipeState] = useState<WeekSwipeViewState>({
    translateX: 0,
    isDragging: false,
    isAnimating: false,
  });
  // Maps entry id -> optimistic target date for in-flight cross-day moves
  const [pendingMoves, setPendingMoves] = useState<Map<number, string>>(new Map());
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));
  const {
    meal_assistant_special_dates: configuredSpecialDates,
    meal_assistant_produce_category: produceCategoryName,
  } = useAppConfig();

  const today = new Date();
  const currentWeekStart = getMealPlanWeekStartSaturday(today);
  const requestedDate = weekStart ? parseLocalDate(weekStart) : null;
  const weekStartDate = requestedDate
    ? getMealPlanWeekStartSaturday(requestedDate)
    : currentWeekStart;
  const canonicalWeekStart = formatDate(weekStartDate);
  useEffect(() => {
    if (weekStart !== canonicalWeekStart) {
      navigate(`/meal-plan/${canonicalWeekStart}`, { replace: true });
    }
  }, [canonicalWeekStart, navigate, weekStart]);
  useEffect(() => {
    skipAssistantSessionPersist.current = true;
    const savedSession = loadMealAssistantSession(canonicalWeekStart);
    setAssistantMode(savedSession?.assistantMode ?? false);
    setAssistantEntryPlans(savedSession?.assistantEntryPlans ?? {});
    setAssistantModalEntry(null);
    setAssistantModalPlan(null);
  }, [canonicalWeekStart]);

  useEffect(() => {
    weekSwipeStartRef.current = null;
    if (weekSwipeResetTimeoutRef.current !== null) {
      window.clearTimeout(weekSwipeResetTimeoutRef.current);
      weekSwipeResetTimeoutRef.current = null;
    }
    setWeekSwipeState({ translateX: 0, isDragging: false, isAnimating: false });

    return () => {
      if (weekSwipeResetTimeoutRef.current !== null) {
        window.clearTimeout(weekSwipeResetTimeoutRef.current);
        weekSwipeResetTimeoutRef.current = null;
      }
    };
  }, [canonicalWeekStart]);
  const todayStr = formatDate(today);
  const endDate = addDays(weekStartDate, 6);
  const canonicalWeekEnd = formatDate(endDate);

  // Week picker derived values — computed here to avoid IIFE in JSX.
  const pickerHighlightedWeekStart = pendingPickerDate
    ? getMealPlanWeekStartSaturday(pendingPickerDate)
    : weekStartDate;
  const pickerHighlightedWeekEnd = addDays(pickerHighlightedWeekStart, 6);
  const pickerSelectedDate = pendingPickerDate ?? weekStartDate;
  const pickerHighlightedWeek = {
    from: pickerHighlightedWeekStart,
    to: pickerHighlightedWeekEnd,
  };
  const pickerDefaultMonth = pendingPickerDate ?? weekStartDate;
  const { startMonth: pickerStartMonth, endMonth: pickerEndMonth } = getMealPlanPickerRange(today);

  const { data, isLoading, isError } = useMealPlan(weekStartDate, endDate);
  const {
    data: shoppingListEntries,
    isFetchedAfterMount: hasFetchedShoppingListEntries,
    isFetching: isFetchingShoppingListEntries,
  } = useQuery({
    ...getShoppingListEntriesQueryOptions(),
    enabled: assistantMode,
    refetchOnMount: 'always',
  });
  const shoppingEntries = shoppingListEntries ?? [];
  const shouldClearAssistantFromShoppingList =
    hasFetchedShoppingListEntries &&
    shouldClearAssistantSessionFromShoppingList(
      shoppingEntries,
      canonicalWeekStart,
      canonicalWeekEnd,
      {
        isPlanning: isAssistantPlanning,
        isRefreshing: isFetchingShoppingListEntries,
      },
    );

  // Fetch cook logs for the past/today portion of the displayed week.
  // Only dates <= today can have cook logs; use the week start or today
  // (whichever is earlier) as the fromDate.
  const cookLogFrom = formatDate(weekStartDate) <= todayStr ? formatDate(weekStartDate) : todayStr;
  const { data: cookLogData } = useCookLog(cookLogFrom, todayStr);

  // Fetch calendar events for the displayed week.
  const {
    byDate: calendarEventsByDate,
    refetch: refetchCalendar,
    error: calendarError,
    isError: isCalendarError,
  } = useCalendarEvents(weekStartDate, endDate);
  const invalidateCalendar = useRefetchCalendarEvents(weekStartDate, endDate);
  const {
    byDate: weatherByDate,
    refetch: refetchWeather,
    error: weatherError,
    isError: isWeatherError,
  } = useWeatherForecast(weekStartDate, endDate);
  const invalidateWeather = useRefetchWeatherForecast(weekStartDate, endDate);

  // Pull-to-refresh: background-refresh calendar events and update display on change.
  usePullToRefresh({
    onRefresh: () => {
      invalidateCalendar();
      invalidateWeather();
      void refetchCalendar();
      void refetchWeather();
    },
  });

  // Only show the full-screen spinner on the very first load.
  // Once data has been received at least once, week navigation and background
  // refreshes should rely solely on the corner progress spinner.
  const hasEverHadData = useRef(false);
  if (data !== undefined) hasEverHadData.current = true;
  const deleteMeal = useDeleteMealPlan();
  const createMealPlan = useCreateMealPlan();
  const updateMeal = useUpdateMealPlan();

  const handleDelete = (id: number) => {
    if (!hasPersonalToken) return;
    deleteMeal.mutate(id);
  };

  const handleClearWeek = async () => {
    if (!hasPersonalToken || !data) return;
    setIsClearingWeek(true);
    try {
      const results = await Promise.allSettled(
        data.results.map((entry) =>
          apiDelete(`/meal-plan/${entry.id}/`, MEAL_PLAN_ITEM_QUERY_PARAMS),
        ),
      );
      const deletedIds = data.results
        .filter((_entry, index) => results[index].status === 'fulfilled')
        .map((entry) => entry.id);
      deletedIds.forEach((id) => removeMealPlanFromCaches(queryClient, id));
      const failed = results.length - deletedIds.length;
      invalidateCacheQueries(
        queryClient,
        'meal-plan',
        'shopping-list',
        MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
      );
      void invalidateAndRefreshMealPlanRedirectWeek(queryClient, apiGet);
      if (failed > 0) {
        setAssistantFeedback({
          variant: 'danger',
          message: `Failed to delete ${failed} meal plan entr${failed === 1 ? 'y' : 'ies'}. Please try again.`,
        });
      }
    } catch {
      setAssistantFeedback({
        variant: 'danger',
        message: 'Failed to clear the week. Please try again.',
      });
    } finally {
      setIsClearingWeek(false);
      setShowClearConfirm(false);
    }
  };

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<PaginatedResponse<MealType>>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const sortedMealTypes = [...mealTypes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const dinnerMealType =
    sortedMealTypes.find((mealType) => mealType.name.toLowerCase().includes('dinner')) ??
    sortedMealTypes[0];
  const dinnerMealTypeId = dinnerMealType?.id;
  const lunchMealType = sortedMealTypes.find((mealType) =>
    mealType.name.toLowerCase().includes('lunch'),
  );
  const lunchMealTypeId = lunchMealType?.id;

  useEffect(() => {
    if (skipAssistantSessionPersist.current) {
      skipAssistantSessionPersist.current = false;
      return;
    }

    saveMealAssistantSession(canonicalWeekStart, {
      assistantMode,
      assistantEntryPlans,
    });
  }, [assistantEntryPlans, assistantMode, canonicalWeekStart]);

  useEffect(() => {
    if (!assistantMode) return;
    if (!shouldClearAssistantFromShoppingList) return;
    setAssistantMode(false);
    setAssistantEntryPlans({});
    setAssistantModalEntry(null);
    setAssistantModalPlan(null);
    setAssistantFeedback({
      variant: 'info',
      message:
        shoppingEntries.length === 0
          ? 'Meal planning assistance ended because the shopping list is now empty.'
          : 'Meal planning assistance ended because the shopping list no longer contains items for this week.',
    });
  }, [
    assistantMode,
    canonicalWeekStart,
    shouldClearAssistantFromShoppingList,
    shoppingEntries.length,
  ]);

  const sensors = useMealPlanSensors();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const previousWeekStartDate = addDays(weekStartDate, -7);
  const previousWeekEndDate = addDays(previousWeekStartDate, 6);
  const previousWeekDays = Array.from({ length: 7 }, (_, i) => addDays(previousWeekStartDate, i));
  const nextWeekStartDate = addDays(weekStartDate, 7);
  const nextWeekEndDate = addDays(nextWeekStartDate, 6);
  const nextWeekDays = Array.from({ length: 7 }, (_, i) => addDays(nextWeekStartDate, i));

  const getCachedMealPlanEntries = (fromDate: Date, toDate: Date): MealPlan[] =>
    queryClient.getQueryData<PaginatedResponse<MealPlan>>([
      'meal-plan',
      formatDate(fromDate),
      formatDate(toDate),
    ])?.results ?? [];

  const allEntries = data?.results ?? [];
  const byDayAndMealType = buildMealPlanByDayAndMealType(
    days,
    sortedMealTypes,
    allEntries,
    pendingMoves,
  );
  const previousWeekEntries = getCachedMealPlanEntries(previousWeekStartDate, previousWeekEndDate);
  const previousWeekByDayAndMealType = buildMealPlanByDayAndMealType(
    previousWeekDays,
    sortedMealTypes,
    previousWeekEntries,
  );
  const nextWeekEntries = getCachedMealPlanEntries(nextWeekStartDate, nextWeekEndDate);
  const nextWeekByDayAndMealType = buildMealPlanByDayAndMealType(
    nextWeekDays,
    sortedMealTypes,
    nextWeekEntries,
  );
  const assistedEntryIds = new Set(Object.keys(assistantEntryPlans).map((value) => Number(value)));

  const activeEntry = activeId != null ? (allEntries.find((e) => e.id === activeId) ?? null) : null;

  const handleDragStart = (event: DragStartEvent) => {
    lastOverSnapshotRef.current = null;
    lastActiveContainerIdRef.current =
      (event.active.data.current as WithSortable)?.sortable?.containerId ?? null;
    setActiveId(event.active.id as number);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const over = event.over;
    if (!over) return;
    lastOverSnapshotRef.current = {
      id: over.id,
      sortableContainerId: getSortableContainerId(over.data.current),
    };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    const fallbackOverSnapshot = lastOverSnapshotRef.current;
    lastOverSnapshotRef.current = null;
    const overId = over?.id ?? fallbackOverSnapshot?.id;
    if (overId == null) return;
    if (!hasPersonalToken) return;

    const activeEntryId = active.id as number;
    // active.data.current may be empty if the node unmounted during the drag
    // (dnd-kit falls back to defaultData in that case), so use the value cached
    // at drag-start as a reliable fallback.
    const activeContainerId =
      (active.data.current as WithSortable)?.sortable?.containerId ??
      lastActiveContainerIdRef.current;

    if (!activeContainerId) return;

    let targetContainerId = resolveDropTargetContainerId({
      overId,
      activeContainerId,
      collisions: event.collisions,
      overSortableContainerId: getSortableContainerId(over?.data.current),
      fallbackSortableContainerId: fallbackOverSnapshot?.sortableContainerId,
    });
    if (!targetContainerId) return;

    // On touch devices (e.g. iPad), dragEnd can fire with `over` drifted back
    // to the source container because the touchend coordinates differ from the
    // last touchmove. If the primary resolution resolves to the source, retry
    // using the snapshot captured during the last valid dragOver event.
    if (targetContainerId === activeContainerId && fallbackOverSnapshot != null) {
      const snapshotContainerId = resolveDropTargetContainerId({
        overId: fallbackOverSnapshot.id,
        activeContainerId,
        collisions: event.collisions,
        overSortableContainerId: null,
        fallbackSortableContainerId: fallbackOverSnapshot.sortableContainerId,
      });
      if (snapshotContainerId != null && snapshotContainerId !== activeContainerId) {
        targetContainerId = snapshotContainerId;
      }
    }

    if (activeContainerId === targetContainerId) return;

    // Cross-container move: optimistically update UI then confirm via API
    const entry = allEntries.find((e) => e.id === activeEntryId);
    if (!entry) return;
    const recipeId = typeof entry.recipe === 'object' ? entry.recipe.id : entry.recipe;
    const entryMealTypeId =
      typeof entry.meal_type === 'object' ? entry.meal_type.id : entry.meal_type;

    const { date: targetDate, mealTypeId: targetMealTypeId } = parseContainerId(targetContainerId);
    const newMealTypeId = targetMealTypeId ?? entryMealTypeId;

    // Immediately show the entry in the new container
    setPendingMoves((prev) => new Map(prev).set(activeEntryId, targetContainerId));

    updateMeal.mutate(
      {
        id: activeEntryId,
        data: {
          recipe: recipeId,
          meal_type: newMealTypeId,
          from_date: targetDate,
          to_date: targetDate,
          servings: entry.servings ?? 1,
        },
      },
      {
        onSettled: () => {
          setPendingMoves((prev) => {
            const next = new Map(prev);
            next.delete(activeEntryId);
            return next;
          });
        },
      },
    );
  };

  const handleDragCancel = () => {
    lastOverSnapshotRef.current = null;
    setActiveId(null);
  };

  const handleShowAssistant = (entry: MealPlan) => {
    setAssistantModalEntry(entry);
    setAssistantModalPlan(assistantEntryPlans[entry.id] ?? null);
  };

  const handleSelectAssistantAlternative = async (recipe: Recipe) => {
    if (!assistantModalEntry || !assistantModalPlan || isAssistantSwitching) return;

    setIsAssistantSwitching(true);
    try {
      const recipeId = recipe.id;
      const mealTypeId =
        typeof assistantModalEntry.meal_type === 'object'
          ? assistantModalEntry.meal_type.id
          : assistantModalEntry.meal_type;
      const currentDate = assistantModalEntry.from_date.split('T')[0];
      const updatedEntry = await updateMeal.mutateAsync({
        id: assistantModalEntry.id,
        data: {
          recipe: recipeId,
          meal_type: mealTypeId,
          from_date: currentDate,
          to_date: currentDate,
          servings: assistantModalEntry.servings ?? 1,
          ...(assistantModalEntry.note ? { note: assistantModalEntry.note } : {}),
        },
      });

      updateMealPlanWeekCache(queryClient, weekStartDate, endDate, updatedEntry);

      const nextPlan = swapMealAssistantSelection(assistantModalPlan, recipeId);
      setAssistantEntryPlans((current) => ({
        ...current,
        [assistantModalEntry.id]: nextPlan,
      }));
      setAssistantModalEntry(null);
      setAssistantModalPlan(null);
    } finally {
      setIsAssistantSwitching(false);
    }
  };

  const handleAssistantToggle = async () => {
    if (!hasPersonalToken) return;
    if (isLoading) return;

    if (assistantMode) {
      setAssistantMode(false);
      setAssistantEntryPlans({});
      setAssistantModalEntry(null);
      setAssistantModalPlan(null);
      return;
    }

    if ((!dinnerMealTypeId && !lunchMealTypeId) || isAssistantPlanning) return;

    const emptyDinnerDates = dinnerMealTypeId
      ? days
          .map((day) => formatDate(day))
          .filter((date) => (byDayAndMealType[date]?.[dinnerMealTypeId] ?? []).length === 0)
      : [];
    const bankHolidayDates = getCalendarEventDatesByCategory(
      calendarEventsByDate ?? {},
      'bank-holiday',
    );
    const emptyWeekendLunchDates = getEmptyWeekendLunchDates(
      days,
      byDayAndMealType,
      lunchMealTypeId,
      [...bankHolidayDates],
    );

    setAssistantFeedback(null);

    if (emptyDinnerDates.length === 0 && emptyWeekendLunchDates.length === 0) {
      setAssistantFeedback({
        variant: 'info',
        message: 'There are no empty dinner or weekend lunch slots to fill in this week.',
      });
      return;
    }

    setIsAssistantPlanning(true);

    try {
      const assistantData = await queryClient.fetchQuery(
        getMealPlanningAssistantDataQueryOptions(weekStartDate, endDate, produceCategoryName),
      );
      const dinnerPlan = dinnerMealTypeId
        ? buildMealAssistantPlan({
            weekStart: weekStartDate,
            weekEnd: endDate,
            planType: 'dinner',
            emptyDinnerDates,
            existingWeekMeals: allEntries,
            historicalMeals: assistantData.historicalMeals,
            recipes: assistantData.recipes,
            keywordNameById: assistantData.keywordNameById,
            upSoonRecipeIds: assistantData.upSoonRecipeIds,
            calendarEventsByDate,
            weatherByDate,
            publicHolidayDates: [...bankHolidayDates],
            dinnerTime: dinnerMealType?.time,
            specialDates: configuredSpecialDates,
            produceFoodNames: assistantData.produceFoodNames,
            precalculation: assistantData.precalculation,
          })
        : { slots: [], issues: [] };
      const lunchPlan = lunchMealTypeId
        ? buildMealAssistantPlan({
            weekStart: weekStartDate,
            weekEnd: endDate,
            planType: 'lunch',
            emptyDinnerDates: emptyWeekendLunchDates,
            existingWeekMeals: allEntries,
            historicalMeals: assistantData.historicalMeals,
            recipes: assistantData.recipes,
            keywordNameById: assistantData.keywordNameById,
            upSoonRecipeIds: assistantData.upSoonRecipeIds,
            calendarEventsByDate,
            weatherByDate,
            publicHolidayDates: [...bankHolidayDates],
            dinnerTime: lunchMealType?.time,
            specialDates: configuredSpecialDates,
            produceFoodNames: assistantData.produceFoodNames,
            precalculation: assistantData.precalculation,
          })
        : { slots: [], issues: [] };
      const plansToCreate = [
        ...dinnerPlan.slots.map((slot) => ({ slot, mealTypeId: dinnerMealTypeId })),
        ...lunchPlan.slots.map((slot) => ({ slot, mealTypeId: lunchMealTypeId })),
      ].filter((planned): planned is { slot: MealAssistantSlotPlan; mealTypeId: number } =>
        Boolean(planned.mealTypeId),
      );
      const allIssues = [...dinnerPlan.issues, ...lunchPlan.issues];

      if (plansToCreate.length === 0) {
        setAssistantFeedback({
          variant: 'warning',
          message: allIssues[0] ?? 'No suitable assisted meals were available for this week.',
        });
        return;
      }

      const nextPlans: Record<number, MealAssistantSlotPlan> = {};
      for (const planned of plansToCreate) {
        const { slot: slotPlan, mealTypeId } = planned;
        const created = await createMealPlan.mutateAsync({
          recipe: slotPlan.selected.recipe.id,
          meal_type: mealTypeId,
          from_date: slotPlan.date,
          servings: slotPlan.selected.recipe.servings ?? 1,
          addshopping: true,
        });
        updateMealPlanWeekCache(queryClient, weekStartDate, endDate, created);
        nextPlans[created.id] = slotPlan;
      }

      await queryClient.refetchQueries({
        queryKey: ['meal-plan', formatDate(weekStartDate), formatDate(endDate)],
        type: 'active',
      });

      setAssistantMode(true);
      setAssistantEntryPlans((current) => ({ ...current, ...nextPlans }));
      const dinnerCount = dinnerPlan.slots.length;
      const lunchCount = lunchPlan.slots.length;
      const slotSummaryParts: string[] = [];
      if (dinnerCount > 0) {
        slotSummaryParts.push(`${dinnerCount} dinner slot${dinnerCount === 1 ? '' : 's'}`);
      }
      if (lunchCount > 0) {
        slotSummaryParts.push(`${lunchCount} weekend lunch slot${lunchCount === 1 ? '' : 's'}`);
      }
      const slotSummary = slotSummaryParts.join(' and ');
      setAssistantFeedback({
        variant: allIssues.length > 0 ? 'warning' : 'success',
        message:
          allIssues.length > 0
            ? `Filled ${slotSummary}. ${allIssues.join(' ')}`
            : `Filled ${slotSummary}.`,
      });
    } catch (error) {
      setAssistantMode(false);
      setAssistantFeedback({
        variant: 'danger',
        message:
          error instanceof Error
            ? error.message
            : 'Assisted meal planning failed. Please try again.',
      });
    } finally {
      setIsAssistantPlanning(false);
    }
  };

  if (isError) {
    return <Alert variant="danger">Failed to load meal plan.</Alert>;
  }

  // Derived cook log modal props — computed outside JSX to avoid inline IIFEs.
  const cookLogMealType =
    cookLogEntry && typeof cookLogEntry.meal_type === 'object'
      ? (cookLogEntry.meal_type as MealType)
      : undefined;
  const cookLogRecipeId = cookLogEntry
    ? typeof cookLogEntry.recipe === 'object'
      ? cookLogEntry.recipe.id
      : (cookLogEntry.recipe as number)
    : 0;
  const cookLogDate = cookLogEntry?.from_date.split('T')[0] ?? '';

  const clearWeekSwipeResetTimeout = () => {
    if (weekSwipeResetTimeoutRef.current === null) return;
    window.clearTimeout(weekSwipeResetTimeoutRef.current);
    weekSwipeResetTimeoutRef.current = null;
  };

  const navigateToWeek = (direction: WeekSwipeDirection) => {
    navigate(`/meal-plan/${formatDate(addDays(weekStartDate, direction * 7))}`);
  };

  const handleWeekSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    clearWeekSwipeResetTimeout();
    if (!supportsMobileWeekSwipe() || event.touches.length !== 1) {
      weekSwipeStartRef.current = null;
      return;
    }
    if (shouldIgnoreWeekSwipeTarget(event.target)) {
      weekSwipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    weekSwipeStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      endX: touch.clientX,
      endY: touch.clientY,
      hasHorizontalIntent: false,
    };
  };

  const handleWeekSwipeMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = weekSwipeStartRef.current;
    if (!gesture || event.touches.length !== 1) return;

    const touch = event.touches[0];
    gesture.endX = touch.clientX;
    gesture.endY = touch.clientY;
    const deltaX = gesture.endX - gesture.startX;
    const deltaY = gesture.endY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!gesture.hasHorizontalIntent) {
      if (
        absX < MEAL_PLAN_WEEK_SWIPE_INTENT_DISTANCE_PX ||
        absX < absY * MEAL_PLAN_WEEK_SWIPE_INTENT_RATIO
      ) {
        return;
      }
      gesture.hasHorizontalIntent = true;
    }

    // Once this touch is clearly the meal-plan carousel gesture, cancel the
    // browser's horizontal navigation gesture so edge swipes change weeks
    // instead of moving back/forward in history.
    if (event.cancelable) event.preventDefault();

    const width = weekSwipeAreaRef.current?.clientWidth ?? window.innerWidth;
    const maxPullDistance = Math.max(width, 1);
    setWeekSwipeState({
      translateX: Math.max(-maxPullDistance, Math.min(maxPullDistance, deltaX)),
      isDragging: true,
      isAnimating: false,
    });
  };

  const animateWeekSwipeTo = (translateX: number, onComplete?: () => void) => {
    clearWeekSwipeResetTimeout();
    setWeekSwipeState({ translateX, isDragging: false, isAnimating: true });
    weekSwipeResetTimeoutRef.current = window.setTimeout(() => {
      weekSwipeResetTimeoutRef.current = null;
      onComplete?.();
      setWeekSwipeState({ translateX: 0, isDragging: false, isAnimating: false });
    }, MEAL_PLAN_WEEK_SWIPE_ANIMATION_MS);
  };

  const handleWeekSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = weekSwipeStartRef.current;
    weekSwipeStartRef.current = null;
    if (!gesture || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const direction = getWeekSwipeDirection({
      ...gesture,
      endX: touch.clientX,
      endY: touch.clientY,
    });

    if (direction === null) {
      if (gesture.hasHorizontalIntent) animateWeekSwipeTo(0);
      return;
    }

    const width = weekSwipeAreaRef.current?.clientWidth ?? window.innerWidth;
    animateWeekSwipeTo(direction === 1 ? -width : width, () => navigateToWeek(direction));
  };

  const handleWeekSwipeCancel = () => {
    const gesture = weekSwipeStartRef.current;
    weekSwipeStartRef.current = null;
    if (gesture?.hasHorizontalIntent) animateWeekSwipeTo(0);
  };

  return (
    <div className="pt-2 meal-plan-page">
      {!hasPersonalToken && <NoTokenAlert />}
      {isCalendarError && (
        <Alert variant="warning" className="py-2 mb-3">
          Calendar sync issue:{' '}
          {calendarError instanceof Error
            ? calendarError.message
            : 'Unable to load calendar events. Please try again later.'}
        </Alert>
      )}
      {isWeatherError && (
        <Alert variant="warning" className="py-2 mb-3">
          Weather sync issue:{' '}
          {weatherError instanceof Error
            ? weatherError.message
            : 'Unable to load weather forecast. Please try again later.'}
        </Alert>
      )}
      {assistantFeedback && (
        <Alert
          variant={assistantFeedback.variant}
          className="py-2 mb-3"
          dismissible
          onClose={() => setAssistantFeedback(null)}
        >
          {assistantFeedback.message}
        </Alert>
      )}
      <div className="d-flex align-items-center mb-3">
        <Button
          variant="outline-secondary"
          onClick={() => navigate(`/meal-plan/${formatDate(addDays(weekStartDate, -7))}`)}
          aria-label="Previous week"
          style={navButtonStyle}
        >
          ‹
        </Button>
        <div className="flex-grow-1 text-center">
          <div className="d-inline-flex align-items-center gap-2">
            <ButtonGroup aria-label="Current week controls">
              <Button
                variant="outline-secondary"
                style={{ minHeight: 44, padding: '0 1rem' }}
                onClick={() => navigate(`/meal-plan/${formatDate(currentWeekStart)}`)}
                aria-label="Go to current week"
              >
                Today
              </Button>
              <Button
                variant="outline-secondary"
                style={{ minHeight: 44, padding: '0 0.75rem' }}
                onClick={() => setShowWeekPickerModal(true)}
                aria-label="Pick week to jump to"
              >
                <CalendarDate size={16} />
              </Button>
            </ButtonGroup>
            <Button
              variant="secondary"
              style={{ minHeight: 44, padding: '0 0.75rem' }}
              onClick={() => {
                void handleAssistantToggle();
              }}
              disabled={
                !hasPersonalToken ||
                (!dinnerMealTypeId && !lunchMealTypeId) ||
                isAssistantPlanning ||
                isLoading
              }
              aria-label={
                assistantMode
                  ? 'Turn off meal planning assistance'
                  : 'Turn on meal planning assistance'
              }
            >
              {isAssistantPlanning ? <Spinner size="sm" /> : <Magic size={16} />}
            </Button>
            <Button
              variant="danger"
              style={{ minHeight: 44, padding: '0 1rem' }}
              onClick={() => setShowClearConfirm(true)}
              disabled={
                !hasPersonalToken ||
                isClearingWeek ||
                isLoading ||
                (data?.results.length ?? 0) === 0
              }
              aria-label="Clear week"
            >
              <Trash3 size={16} />
            </Button>
          </div>
        </div>
        <Button
          variant="outline-secondary"
          onClick={() => navigate(`/meal-plan/${formatDate(addDays(weekStartDate, 7))}`)}
          aria-label="Next week"
          style={navButtonStyle}
        >
          ›
        </Button>
      </div>

      {!hasEverHadData.current && isLoading && <LoadingMascot />}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={weekSwipeAreaRef}
          className="meal-plan-week-swipe-area"
          onTouchStart={handleWeekSwipeStart}
          onTouchMove={handleWeekSwipeMove}
          onTouchEnd={handleWeekSwipeEnd}
          onTouchCancel={handleWeekSwipeCancel}
          aria-label="Meal plan week carousel"
          style={{
            paddingLeft: '0.5rem',
            paddingRight: '0.5rem',
            marginTop: '1rem',
          }}
        >
          <MealPlanWeekCarousel
            previousWeek={{
              days: previousWeekDays,
              byDayAndMealType: previousWeekByDayAndMealType,
            }}
            currentWeek={{
              days,
              byDayAndMealType,
              pendingMoves,
              cookLogData,
              calendarEventsByDate,
              weatherByDate,
              assistantMode,
              assistedEntryIds,
              assistantEntryPlans,
            }}
            nextWeek={{
              days: nextWeekDays,
              byDayAndMealType: nextWeekByDayAndMealType,
            }}
            mealTypes={sortedMealTypes}
            todayStr={todayStr}
            hasPersonalToken={hasPersonalToken}
            swipeState={weekSwipeState}
            onDelete={handleDelete}
            onEntryClick={(entry) => navigate(`/meal-plan-entry/${entry.id}`)}
            onAddMeal={(date, mealTypeId) => setAddModal({ date, mealTypeId })}
            onLogCook={setCookLogEntry}
            onEdit={setEditEntry}
            onShowAssistant={handleShowAssistant}
          />
        </div>

        <DragOverlay>
          {activeEntry && (
            <EntryCard
              entry={activeEntry}
              onDelete={noop}
              onClick={noop}
              dragging
              assistantEnabled={assistantMode && assistedEntryIds.has(activeEntry.id)}
              assistantPlan={assistantEntryPlans[activeEntry.id]}
              onShowAssistant={handleShowAssistant}
            />
          )}
        </DragOverlay>
      </DndContext>

      {addModal && (
        <AddMealModal
          date={addModal.date}
          initialMealTypeId={addModal.mealTypeId}
          onHide={() => setAddModal(null)}
          mealTypes={mealTypes}
        />
      )}
      {cookLogEntry && (
        <CookLogModal
          show
          onHide={() => setCookLogEntry(null)}
          recipeId={cookLogRecipeId}
          mealPlanDate={cookLogDate}
          mealType={cookLogMealType}
        />
      )}
      {editEntry && <EditMealModal entry={editEntry} onHide={() => setEditEntry(null)} />}
      <MealPlanAssistantModal
        analysis={assistantModalPlan}
        currentEntry={assistantModalEntry}
        isSwitching={isAssistantSwitching}
        onSelectAlternative={(recipe) => {
          void handleSelectAssistantAlternative(recipe);
        }}
        onHide={() => {
          setAssistantModalEntry(null);
          setAssistantModalPlan(null);
        }}
      />
      <Modal show={showClearConfirm} onHide={() => setShowClearConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Clear week?</Modal.Title>
        </Modal.Header>
        <Modal.Body>This will permanently delete all meal plan entries for this week.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void handleClearWeek();
            }}
            disabled={isClearingWeek}
          >
            {isClearingWeek ? (
              <>
                <Spinner size="sm" className="me-2" />
                Clearing…
              </>
            ) : (
              'Clear week'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={showWeekPickerModal}
        onHide={() => {
          setShowWeekPickerModal(false);
          setPendingPickerDate(null);
        }}
        centered
        aria-labelledby="jump-to-week-title"
      >
        <Modal.Header closeButton>
          <Modal.Title id="jump-to-week-title" className="fs-6">
            Pick any date in the target week
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <DayPicker
            key={`${canonicalWeekStart}-${showWeekPickerModal ? 'open' : 'closed'}`}
            className="meal-plan-week-picker"
            mode="single"
            defaultMonth={pickerDefaultMonth}
            selected={pickerSelectedDate}
            modifiers={{
              highlightedWeek: pickerHighlightedWeek,
              highlightedWeekStart: pickerHighlightedWeekStart,
              highlightedWeekEnd: pickerHighlightedWeekEnd,
            }}
            modifiersClassNames={{
              highlightedWeek: 'meal-plan-week-picker__highlighted-week',
              highlightedWeekStart: 'meal-plan-week-picker__highlighted-week-start',
              highlightedWeekEnd: 'meal-plan-week-picker__highlighted-week-end',
            }}
            weekStartsOn={6}
            showOutsideDays
            fixedWeeks
            captionLayout="dropdown"
            startMonth={pickerStartMonth}
            endMonth={pickerEndMonth}
            aria-label="Pick any date in the target week"
            aria-describedby="jump-to-week-help"
            onDayClick={(day) => {
              setPendingPickerDate(day);
            }}
          />
          <p id="jump-to-week-help" className="text-body-secondary small mb-0 mt-2 text-center">
            Select a day then press Apply to jump to that week.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowWeekPickerModal(false);
              setPendingPickerDate(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pendingPickerDate === null}
            onClick={() => {
              if (pendingPickerDate) {
                setShowWeekPickerModal(false);
                setPendingPickerDate(null);
                navigate(
                  `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(pendingPickerDate))}`,
                );
              }
            }}
          >
            Apply
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
