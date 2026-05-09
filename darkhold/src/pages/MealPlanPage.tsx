import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Card,
  Table,
  Button,
  InputGroup,
  Modal,
  Form,
  Spinner,
  Alert,
} from "react-bootstrap";
import { AsyncTypeahead } from "react-bootstrap-typeahead";
import "react-bootstrap-typeahead/css/Typeahead.css";
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
} from "react-bootstrap-icons";
import { proxyMediaUrl } from "../utils/mediaUrl";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useMealPlan,
  useDeleteMealPlan,
  useCreateMealPlan,
  useUpdateMealPlan,
} from "../hooks/useMealPlan";
import {
  useCalendarEvents,
  formatEventTimeRange,
  useRefetchCalendarEvents,
} from "../hooks/useCalendarEvents";
import type {
  CalendarEventsByDate,
  CalendarEvent,
} from "../hooks/useCalendarEvents";
import {
  getWeatherDisruptionBand,
  useRefetchWeatherForecast,
  useWeatherForecast,
} from "../hooks/useWeatherForecast";
import type {
  WeatherByDate,
  WeatherDayForecast,
  WeatherDisruptionBand,
} from "../hooks/useWeatherForecast";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type {
  MealPlan,
  Recipe,
  MealType,
  PaginatedResponse,
} from "../api/tandoor-types";
import { deriveMealType } from "../utils/mealUtils";
import {
  formatDate,
  formatMonthYear,
  getMealPlanWeekStartSaturday,
  getWeekStartingSaturday,
  parseLocalDate,
} from "../utils/dateUtils";
import { LoadingMascot } from "../components/LoadingMascot";
import { NoTokenAlert } from "../components/NoTokenAlert";
import { CookLogModal } from "../components/CookLogModal";
import {
  useCookLog,
  isCookedOnDate,
  type CookedByDate,
} from "../hooks/useCookLog";
import { smallCircleButtonStyle } from "../utils/buttonStyles";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { DroppableTableRow } from "./DroppableTableRow";

type WithSortable = { sortable?: { containerId: string } } | undefined;

const noop = () => {};

const navButtonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  fontSize: "1.5rem",
  lineHeight: 1,
  padding: "0 0.5rem",
};

const compactTitleButtonSizePx = 24;
const compactTitleButtonFontSize = "0.875rem";
const circleButtonStyle = smallCircleButtonStyle;
const compactTitleButtonStyle: React.CSSProperties = {
  ...smallCircleButtonStyle,
  width: compactTitleButtonSizePx,
  height: compactTitleButtonSizePx,
  fontSize: compactTitleButtonFontSize,
};
const PLACEHOLDER_BG = "#d0d0d0";
const PLACEHOLDER_ICON_COLOR = "#a0a0a0";

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
      style={{
        width: "100%",
        height: "100%",
        background: PLACEHOLDER_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        WebkitTouchCallout: "none",
        userSelect: "none",
        ...dragStyle,
      }}
      {...restDragProps}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={PLACEHOLDER_ICON_COLOR}
        aria-hidden="true"
      >
        <path d="M12 2C6.48 2 2 6.48 2 12h10V2zm0 0c5.52 0 10 4.48 10 10h-10V2zM2 12c0 5.52 4.48 10 10 10L12 12H2z" />
      </svg>
    </div>
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function shortDay(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
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
  if (
    code === 71 ||
    code === 73 ||
    code === 75 ||
    code === 77 ||
    code === 85 ||
    code === 86
  ) {
    return <CloudSnowFill size={14} aria-hidden="true" />;
  }
  if (code === 45 || code === 48)
    return <CloudFog2Fill size={14} aria-hidden="true" />;
  if (code === 0) return <SunFill size={14} aria-hidden="true" />;
  if (code === 1 || code === 2)
    return <CloudSunFill size={14} aria-hidden="true" />;
  return <CloudFill size={14} aria-hidden="true" />;
}

function weatherSummaryForCode(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57)
    return "Drizzle";
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67)
    return "Rain";
  if (
    code === 71 ||
    code === 73 ||
    code === 75 ||
    code === 77 ||
    code === 85 ||
    code === 86
  )
    return "Snow";
  if (code === 80 || code === 81 || code === 82) return "Rain showers";
  if (code === 95 || code === 96 || code === 99) return "Thunderstorm";
  return "Mixed weather";
}

function formatWeatherTime(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (isNaN(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function weatherDisruptionLabel(band: WeatherDisruptionBand): string {
  if (band === "definitely_disrupted") return "Definitely disrupted";
  if (band === "might_be_disrupted") return "Might be disrupted";
  return "OK";
}

function weatherDisruptionClassName(band: WeatherDisruptionBand): string {
  if (band === "definitely_disrupted") return "text-danger";
  if (band === "might_be_disrupted") return "text-warning";
  return "text-success";
}

interface DayCalendarWeatherInfoProps {
  dayEvents: CalendarEvent[];
  weather?: WeatherDayForecast;
  centered?: boolean;
}

function DayCalendarWeatherInfo({
  dayEvents,
  weather,
  centered,
}: DayCalendarWeatherInfoProps) {
  if (!weather && dayEvents.length === 0) return null;
  const disruptionBand = weather ? getWeatherDisruptionBand(weather) : null;
  return (
    <div
      className={`text-muted ${centered ? "text-center" : ""}`}
      style={{ fontSize: "0.7rem", lineHeight: 1.5 }}
    >
      {weather && (
        <div className="mb-1">
          <div
            className="meal-plan-weather-line d-flex align-items-center gap-1"
            style={{ justifyContent: centered ? "center" : undefined }}
          >
            {weatherIconForCode(weather.weatherCode)}
            <span>{weatherSummaryForCode(weather.weatherCode)}</span>
            <span>
              {Math.round(weather.tempMinC)}-{Math.round(weather.tempMaxC)}°C
            </span>
          </div>
          <div className="meal-plan-weather-sun">
            Sunrise {formatWeatherTime(weather.sunrise)} · Sunset{" "}
            {formatWeatherTime(weather.sunset)}
          </div>
          {disruptionBand && (
            <div
              className={weatherDisruptionClassName(disruptionBand)}
              aria-label={`${weatherDisruptionLabel(disruptionBand)}: precipitation probability ${Math.round(weather.precipitationProbabilityMax)} percent, expected rainfall ${weather.precipitationSumMm.toFixed(1)} millimeters`}
            >
              {weatherDisruptionLabel(disruptionBand)} (
              <span title="precipitation probability / expected rainfall">
                {Math.round(weather.precipitationProbabilityMax)}% /{" "}
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
  const sep = id.indexOf("__");
  if (sep === -1) return { date: id, mealTypeId: null };
  const parsed = parseInt(id.slice(sep + 2), 10);
  return { date: id.slice(0, sep), mealTypeId: isNaN(parsed) ? null : parsed };
}

interface EntryCardProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onClick: (entry: MealPlan) => void;
  onEdit?: (entry: MealPlan) => void;
  dragging?: boolean;
  isCooked?: boolean;
  onLogCook?: (entry: MealPlan) => void;
}

interface CompactEntryActionsProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onEdit?: (entry: MealPlan) => void;
  showPrimaryLogAction: boolean;
  onLogCook?: (entry: MealPlan) => void;
}

function CompactEntryActions({
  entry,
  onDelete,
  onEdit,
  showPrimaryLogAction,
  onLogCook,
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
}: EntryCardProps) {
  const recipe = typeof entry.recipe === "object" ? entry.recipe : null;
  const thumbnailSrc = recipe?.image ? proxyMediaUrl(recipe.image) : undefined;
  const titleText = recipe?.name ?? `Recipe #${entry.recipe}`;
  const showPrimaryLogAction = Boolean(!isCooked && onLogCook);

  return (
    <Card
      className={`meal-plan-entry-card border-1 ${dragging ? "shadow-lg" : "shadow-sm"}`}
    >
      <div className="d-flex meal-plan-entry-body">
        <div className="meal-plan-entry-thumb-slot">
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={recipe?.name ?? ""}
              draggable={false}
              className="meal-plan-entry-thumb"
              style={{
                cursor: dragging ? "grabbing" : "grab",
                touchAction: "none",
              }}
            />
          ) : (
            <ThumbnailPlaceholder />
          )}
        </div>
        <div className="meal-plan-entry-content" onClick={() => onClick(entry)}>
          <div className="small fw-semibold meal-plan-entry-title bg-body-tertiary" title={titleText}>
            <span className="meal-plan-entry-title-label">{titleText}</span>
            {!dragging && (
              <CompactEntryActions
                entry={entry}
                onDelete={onDelete}
                onEdit={onEdit}
                showPrimaryLogAction={showPrimaryLogAction}
                onLogCook={onLogCook}
              />
            )}
          </div>
          <div className="meal-plan-entry-details">
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
}

function SortableEntry({
  entry,
  onDelete,
  onClick,
  onEdit,
  isPending,
  isCooked,
  onLogCook,
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
  const recipe = typeof entry.recipe === "object" ? entry.recipe : null;
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
      <div style={{ position: "relative" }}>
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
                  alt={recipe?.name ?? ""}
                  draggable={false}
                  className="meal-plan-entry-thumb"
                  style={{ cursor: "grab", touchAction: "none" }}
                />
              ) : (
                <ThumbnailPlaceholder
                  dragProps={{
                    ref: setActivatorNodeRef as React.Ref<HTMLDivElement>,
                    ...listeners,
                    style: { cursor: "grab", touchAction: "none" },
                  }}
                />
              )}
            </div>
            <div
              className="meal-plan-entry-content"
              onClick={() => onClick(entry)}
            >
              <div className="small fw-semibold meal-plan-entry-title bg-body-tertiary" title={titleText}>
                <span className="meal-plan-entry-title-label">{titleText}</span>
                {!isDragging && (
                  <CompactEntryActions
                    entry={entry}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    showPrimaryLogAction={showPrimaryLogAction}
                    onLogCook={onLogCook}
                  />
                )}
              </div>
              <div className="meal-plan-entry-details">
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
              position: "absolute",
              inset: 0,
              borderRadius: 4,
              backgroundColor: "rgba(200, 200, 200, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
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
        backgroundColor: isOver ? "rgba(13, 110, 253, 0.08)" : undefined,
        transition: "background-color 0.15s",
      }}
    >
      {children}
    </div>
  );
}

interface AddMealModalProps {
  date: string;
  onHide: () => void;
  mealTypes: MealType[];
  initialMealTypeId?: number;
}

function hasUnresolvedKeywordIds(recipe: Recipe): boolean {
  return Array.isArray(recipe.keywords)
    ? recipe.keywords.some((k) => typeof k === "number")
    : false;
}

function AddMealModal({
  date,
  onHide,
  mealTypes,
  initialMealTypeId,
}: AddMealModalProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [recipeOptions, setRecipeOptions] = useState<Recipe[]>([]);
  const [searchError, setSearchError] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<
    number | undefined
  >(undefined);
  const [servings, setServings] = useState(1);
  const [note, setNote] = useState("");
  const createMeal = useCreateMealPlan();
  const defaultMealTypeId = initialMealTypeId ?? mealTypes[0]?.id;
  useEffect(() => {
    setSelectedMealTypeId((prev) => prev ?? defaultMealTypeId);
  }, [defaultMealTypeId]);

  const handleRecipeSearch = async (query: string) => {
    setIsSearching(true);
    setSearchError(false);
    try {
      const data = await apiGet<PaginatedResponse<Recipe>>("/recipe/", {
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

  const handleSelectRecipe = async (selected: Recipe[]) => {
    const r = selected[0] ?? null;
    setSelectedRecipe(r);
    if (!r) {
      setSelectedMealTypeId(initialMealTypeId ?? mealTypes[0]?.id);
      return;
    }
    setServings(r.servings ?? 1);

    if (initialMealTypeId) {
      setSelectedMealTypeId(initialMealTypeId);
      return;
    }

    let hydratedRecipe = r;
    const needsRecipeHydration = hasUnresolvedKeywordIds(r);
    if (needsRecipeHydration) {
      try {
        hydratedRecipe = await apiGet<Recipe>(`/recipe/${r.id}/`);
      } catch (error) {
        console.warn(
          "Failed to hydrate recipe details for meal type matching; using selected recipe payload",
          { recipeId: r.id, error },
        );
      }
    }
    setSelectedMealTypeId(
      deriveMealType(hydratedRecipe, mealTypes) ?? mealTypes[0]?.id,
    );
  };

  const handleSubmit = async () => {
    if (!selectedRecipe) return;
    if (!selectedMealTypeId) return;
    await createMeal.mutateAsync({
      recipe: selectedRecipe.id as unknown as Recipe,
      meal_type: selectedMealTypeId as unknown as MealType,
      from_date: date,
      servings,
      ...(note ? { note } : {}),
      addshopping: true,
    });
    onHide();
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
            options={recipeOptions}
            selected={selectedRecipe ? [selectedRecipe] : []}
            onSearch={handleRecipeSearch}
            onChange={(opts) => {
              void handleSelectRecipe(opts as Recipe[]).catch((error) => {
                console.warn(
                  "Failed to resolve meal type for selected recipe",
                  error,
                );
              });
            }}
            placeholder="Type to search…"
          />
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
                else if (e.target.value === "") setServings(1);
              }}
              style={{ textAlign: "center" }}
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
        <Button
          variant="success"
          disabled={
            !selectedRecipe ||
            createMeal.isPending ||
            !selectedMealTypeId
          }
          onClick={handleSubmit}
        >
          {createMeal.isPending ? <Spinner size="sm" /> : "Add"}
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
  const recipe = typeof entry.recipe === "object" ? entry.recipe : null;
  const [servings, setServings] = useState<number>(entry.servings ?? 1);
  const [note, setNote] = useState<string>(entry.note ?? "");
  const updateMeal = useUpdateMealPlan();

  // Initialise the week picker to the week that contains the entry's current date.
  const initialWeekOffset = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilSat = (6 - today.getDay() + 7) % 7;
    const baseSat = new Date(today);
    baseSat.setDate(today.getDate() + daysUntilSat);
    const [y, m, d] = entry.from_date.split("T")[0].split("-").map(Number);
    const entryDate = new Date(y, m - 1, d);
    entryDate.setHours(0, 0, 0, 0);
    const daysSinceSat = (entryDate.getDay() - 6 + 7) % 7;
    const entrySat = new Date(entryDate);
    entrySat.setDate(entryDate.getDate() - daysSinceSat);
    return Math.round(
      (entrySat.getTime() - baseSat.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  })();

  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const days = getWeekStartingSaturday(weekOffset);
  const [selectedDate, setSelectedDate] = useState<string>(
    entry.from_date.split("T")[0],
  );

  const handleSubmit = async () => {
    const recipeId =
      typeof entry.recipe === "object" ? entry.recipe.id : entry.recipe;
    const mealTypeId =
      typeof entry.meal_type === "object"
        ? entry.meal_type.id
        : entry.meal_type;
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
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
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
                variant={
                  formatDate(d) === selectedDate
                    ? "primary"
                    : "outline-secondary"
                }
                onClick={() => setSelectedDate(formatDate(d))}
                className="d-flex flex-column align-items-center px-2 py-1 flex-fill"
                style={{ minWidth: 0 }}
              >
                <span style={{ fontSize: "0.65rem", lineHeight: 1 }}>
                  {d.toLocaleDateString("en-GB", { weekday: "short" })}
                </span>
                <span
                  style={{
                    fontSize: "0.85rem",
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
                else if (e.target.value === "") setServings(1);
              }}
              style={{ textAlign: "center" }}
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
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={updateMeal.isPending}
        >
          {updateMeal.isPending ? <Spinner size="sm" /> : "Save"}
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
}: MealPlanTableViewProps) {
  return (
    <div className="meal-plan-table-shell">
      <div style={{ overflowX: "auto" }}>
        <Table bordered size="sm" className="meal-plan-table mb-0 w-100">
          <colgroup>
            <col style={{ width: "12%" }} />
            {mealTypes.map((mt) => (
              <col key={mt.id} />
            ))}
            {(calendarEventsByDate || weatherByDate) && (
              <col style={{ width: "24%" }} />
            )}
          </colgroup>
          <thead>
            <tr className="meal-plan-table-header-row">
              <th
                className="py-2 ps-2 text-muted fw-semibold"
                style={{ fontSize: "0.75rem" }}
              >
                Day
              </th>
              {mealTypes.map((mt) => (
                <th
                  key={mt.id}
                  className="py-2 ps-2 fw-semibold"
                  style={{ fontSize: "0.75rem" }}
                >
                  {mt.name}
                </th>
              ))}
              {(calendarEventsByDate || weatherByDate) && (
                <th
                  className="py-2 ps-2 text-muted fw-semibold"
                  style={{ fontSize: "0.75rem" }}
                >
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
                  className={`meal-plan-mobile-row meal-plan-table-data-row ${isToday ? "table-primary" : ""}`}
                >
                  <td
                    className={`meal-plan-mobile-cell py-2 px-2 align-top ${isToday ? "bg-primary text-white" : "bg-body-tertiary"}`}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <small
                        className="fw-semibold"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {shortDay(day)}
                      </small>
                      <Button
                        variant={isToday ? "light" : "outline-success"}
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
                        className={`meal-plan-mobile-cell meal-plan-entry-cell align-top ${entries.length === 0 ? "meal-plan-mobile-empty" : ""}`}
                      >
                        <DroppableDay dateKey={containerId}>
                          <SortableContext
                            id={containerId}
                            items={entries.map((e) => e.id)}
                          >
                            {entries.map((entry) => {
                              const recipeId =
                                typeof entry.recipe === "object"
                                  ? entry.recipe.id
                                  : entry.recipe;
                              const cooked =
                                isPastOrToday &&
                                isCookedOnDate(cookLogData, recipeId, dateKey);
                              return (
                                <SortableEntry
                                  key={entry.id}
                                  entry={entry}
                                  onDelete={onDelete}
                                  onClick={onEntryClick}
                                  onEdit={onEdit}
                                  isPending={pendingMoves.has(entry.id)}
                                  isCooked={cooked}
                                  onLogCook={
                                    isPastOrToday ? onLogCook : undefined
                                  }
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
                      <DayCalendarWeatherInfo
                        dayEvents={dayEvents}
                        weather={dayWeather}
                      />
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

export function MealPlanPage() {
  const navigate = useNavigate();
  const { weekStart } = useParams<{ weekStart: string }>();
  const [addModal, setAddModal] = useState<{
    date: string;
    mealTypeId?: number;
  } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [cookLogEntry, setCookLogEntry] = useState<MealPlan | null>(null);
  const [editEntry, setEditEntry] = useState<MealPlan | null>(null);
  // Maps entry id -> optimistic target date for in-flight cross-day moves
  const [pendingMoves, setPendingMoves] = useState<Map<number, string>>(
    new Map(),
  );
  const hasPersonalToken = Boolean(localStorage.getItem("tandoor_token"));

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
  const todayStr = formatDate(today);
  const endDate = addDays(weekStartDate, 6);

  const { data, isLoading, isError } = useMealPlan(weekStartDate, endDate);

  // Fetch cook logs for the past/today portion of the displayed week.
  // Only dates <= today can have cook logs; use the week start or today
  // (whichever is earlier) as the fromDate.
  const cookLogFrom =
    formatDate(weekStartDate) <= todayStr
      ? formatDate(weekStartDate)
      : todayStr;
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
  const updateMeal = useUpdateMealPlan();

  const handleDelete = (id: number) => {
    if (!hasPersonalToken) return;
    deleteMeal.mutate(id);
  };

  const { data: mealTypesData } = useQuery({
    queryKey: ["meal-types"],
    queryFn: () => apiGet<PaginatedResponse<MealType>>("/meal-type/"),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const sortedMealTypes = [...mealTypes].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

  const allEntries = data?.results ?? [];
  const byDayAndMealType = days.reduce<
    Record<string, Record<number, MealPlan[]>>
  >((acc, day) => {
    const dateKey = formatDate(day);
    acc[dateKey] = {};
    for (const mt of sortedMealTypes) acc[dateKey][mt.id] = [];
    return acc;
  }, {});
  for (const e of allEntries) {
    const pendingTarget = pendingMoves.get(e.id);
    let effectiveDate: string;
    let effectiveMtId: number;
    if (pendingTarget) {
      const { date, mealTypeId: pendingMtId } = parseContainerId(pendingTarget);
      effectiveDate = date;
      effectiveMtId =
        pendingMtId ??
        (typeof e.meal_type === "object" ? e.meal_type.id : e.meal_type);
    } else {
      effectiveDate = e.from_date.split("T")[0];
      effectiveMtId =
        typeof e.meal_type === "object" ? e.meal_type.id : e.meal_type;
    }
    byDayAndMealType[effectiveDate]?.[effectiveMtId]?.push(e);
  }

  const activeEntry =
    activeId != null
      ? (allEntries.find((e) => e.id === activeId) ?? null)
      : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    if (!hasPersonalToken) return;

    const activeEntryId = active.id as number;
    const activeContainerId = (active.data.current as WithSortable)?.sortable
      ?.containerId;

    if (!activeContainerId) return;

    // over.id is a string (dateKey) when dropped on a DroppableDay container,
    // or a number (entry id) when dropped on a SortableEntry.
    let targetContainerId: string;
    if (typeof over.id === "string") {
      targetContainerId = over.id;
    } else {
      const overContainerId = (over.data.current as WithSortable)?.sortable
        ?.containerId;
      if (!overContainerId) return;
      targetContainerId = overContainerId;
    }

    if (activeContainerId === targetContainerId) return;

    // Cross-container move: optimistically update UI then confirm via API
    const entry = allEntries.find((e) => e.id === activeEntryId);
    if (!entry) return;
    const recipeId =
      typeof entry.recipe === "object" ? entry.recipe.id : entry.recipe;
    const entryMealTypeId =
      typeof entry.meal_type === "object"
        ? entry.meal_type.id
        : entry.meal_type;

    const { date: targetDate, mealTypeId: targetMealTypeId } =
      parseContainerId(targetContainerId);
    const newMealTypeId = targetMealTypeId ?? entryMealTypeId;

    // Immediately show the entry in the new container
    setPendingMoves((prev) =>
      new Map(prev).set(activeEntryId, targetContainerId),
    );

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
    setActiveId(null);
  };

  if (isError) {
    return <Alert variant="danger">Failed to load meal plan.</Alert>;
  }

  // Derived cook log modal props — computed outside JSX to avoid inline IIFEs.
  const cookLogMealType =
    cookLogEntry && typeof cookLogEntry.meal_type === "object"
      ? (cookLogEntry.meal_type as MealType)
      : undefined;
  const cookLogRecipeId = cookLogEntry
    ? typeof cookLogEntry.recipe === "object"
      ? cookLogEntry.recipe.id
      : (cookLogEntry.recipe as number)
    : 0;
  const cookLogDate = cookLogEntry?.from_date.split("T")[0] ?? "";

  return (
    <div className="pt-2 meal-plan-page">
      {!hasPersonalToken && <NoTokenAlert />}
      {isCalendarError && (
        <Alert variant="warning" className="py-2 mb-3">
          Calendar sync issue:{" "}
          {calendarError instanceof Error
            ? calendarError.message
            : "Unable to load calendar events. Please try again later."}
        </Alert>
      )}
      {isWeatherError && (
        <Alert variant="warning" className="py-2 mb-3">
          Weather sync issue:{" "}
          {weatherError instanceof Error
            ? weatherError.message
            : "Unable to load weather forecast. Please try again later."}
        </Alert>
      )}
      <div className="d-flex align-items-center mb-3">
        <Button
          variant="outline-secondary"
          onClick={() =>
            navigate(`/meal-plan/${formatDate(addDays(weekStartDate, -7))}`)
          }
          aria-label="Previous week"
          style={navButtonStyle}
        >
          ‹
        </Button>
        <div className="flex-grow-1 text-center">
          <Button
            variant="outline-secondary"
            style={{ minHeight: 44, padding: "0 1rem" }}
            onClick={() =>
              navigate(`/meal-plan/${formatDate(currentWeekStart)}`)
            }
            aria-label="Go to current week"
          >
            Today
          </Button>
        </div>
        <Button
          variant="outline-secondary"
          onClick={() =>
            navigate(`/meal-plan/${formatDate(addDays(weekStartDate, 7))}`)
          }
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
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          style={{
            paddingLeft: "0.5rem",
            paddingRight: "0.5rem",
            marginTop: "1rem",
          }}
        >
          <MealPlanTableView
            days={days}
            mealTypes={sortedMealTypes}
            byDayAndMealType={byDayAndMealType}
            todayStr={todayStr}
            pendingMoves={pendingMoves}
            hasPersonalToken={hasPersonalToken}
            onDelete={handleDelete}
            onEntryClick={(e) => navigate(`/meal-plan-entry/${e.id}`)}
            onAddMeal={(date, mealTypeId) => setAddModal({ date, mealTypeId })}
            onLogCook={setCookLogEntry}
            onEdit={setEditEntry}
            cookLogData={cookLogData}
            calendarEventsByDate={calendarEventsByDate}
            weatherByDate={weatherByDate}
          />
        </div>

        <DragOverlay>
          {activeEntry && (
            <EntryCard
              entry={activeEntry}
              onDelete={noop}
              onClick={noop}
              dragging
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
      {editEntry && (
        <EditMealModal entry={editEntry} onHide={() => setEditEntry(null)} />
      )}
    </div>
  );
}
