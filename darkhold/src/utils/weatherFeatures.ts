export interface WeatherFeatureDay {
  date: string;
  tempMinC: number;
  tempMaxC: number;
  sunrise: string;
  sunset: string;
  precipitationSumMm: number;
  precipitationProbabilityMax?: number;
}

export type WeatherTemperatureBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';
export type WeatherPrecipitationBand = 'dry' | 'showery' | 'wet';
export type WeatherDaylightBand = 'short' | 'medium' | 'long';
export type WeatherOutdoorSuitability = 'poor' | 'fair' | 'good';

export interface WeatherFeatures {
  temperatureBand: WeatherTemperatureBand;
  precipitationBand: WeatherPrecipitationBand;
  daylightHours: number;
  daylightBand: WeatherDaylightBand;
  outdoorSuitability: WeatherOutdoorSuitability;
  tags: string[];
}

const WET_PRECIP_MM = 8;
const WET_PRECIP_PROBABILITY = 80;
const SHOWERY_PRECIP_MM = 2;
const SHOWERY_PRECIP_PROBABILITY = 40;
const COLD_TEMP_C = 10;
const COOL_TEMP_C = 15;
const MILD_TEMP_C = 20;
const WARM_TEMP_C = 25;
const FAIR_OUTDOOR_TEMP_C = 15;
const GOOD_OUTDOOR_TEMP_C = 20;
const SHORT_DAYLIGHT_HOURS = 9;
const LONG_DAYLIGHT_HOURS = 13;

function roundTo(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

function timeOfDayMinutes(value: string): number | null {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function calculateDaylightHours(sunrise: string, sunset: string): number {
  const sunriseMinutes = timeOfDayMinutes(sunrise);
  const sunsetMinutes = timeOfDayMinutes(sunset);
  if (sunriseMinutes == null || sunsetMinutes == null) return 0;
  const rawMinutes = sunsetMinutes - sunriseMinutes;
  const durationMinutes = rawMinutes >= 0 ? rawMinutes : rawMinutes + 24 * 60;
  return roundTo(durationMinutes / 60, 2);
}

export function getTemperatureBand(tempMaxC: number): WeatherTemperatureBand {
  if (tempMaxC < COLD_TEMP_C) return 'cold';
  if (tempMaxC < COOL_TEMP_C) return 'cool';
  if (tempMaxC < MILD_TEMP_C) return 'mild';
  if (tempMaxC < WARM_TEMP_C) return 'warm';
  return 'hot';
}

export function getPrecipitationBand(
  day: Pick<WeatherFeatureDay, 'precipitationSumMm' | 'precipitationProbabilityMax'>,
): WeatherPrecipitationBand {
  if (
    day.precipitationSumMm >= WET_PRECIP_MM ||
    (day.precipitationProbabilityMax ?? 0) >= WET_PRECIP_PROBABILITY
  ) {
    return 'wet';
  }
  if (
    day.precipitationSumMm >= SHOWERY_PRECIP_MM ||
    (day.precipitationProbabilityMax ?? 0) >= SHOWERY_PRECIP_PROBABILITY
  ) {
    return 'showery';
  }
  return 'dry';
}

export function getDaylightBand(daylightHours: number): WeatherDaylightBand {
  if (daylightHours < SHORT_DAYLIGHT_HOURS) return 'short';
  if (daylightHours < LONG_DAYLIGHT_HOURS) return 'medium';
  return 'long';
}

export function getOutdoorSuitability(
  tempMaxC: number,
  precipitationBand: WeatherPrecipitationBand,
): WeatherOutdoorSuitability {
  if (precipitationBand === 'dry' && tempMaxC >= GOOD_OUTDOOR_TEMP_C) return 'good';
  if (precipitationBand !== 'wet' && tempMaxC >= FAIR_OUTDOOR_TEMP_C) return 'fair';
  return 'poor';
}

export function deriveWeatherFeatures(day: WeatherFeatureDay): WeatherFeatures {
  const daylightHours = calculateDaylightHours(day.sunrise, day.sunset);
  const temperatureBand = getTemperatureBand(day.tempMaxC);
  const precipitationBand = getPrecipitationBand(day);
  const daylightBand = getDaylightBand(daylightHours);
  const outdoorSuitability = getOutdoorSuitability(day.tempMaxC, precipitationBand);
  return {
    temperatureBand,
    precipitationBand,
    daylightHours,
    daylightBand,
    outdoorSuitability,
    tags: [
      `${temperatureBand}-day`,
      `${precipitationBand}-day`,
      `${daylightBand}-daylight`,
      `outdoor-${outdoorSuitability}`,
    ],
  };
}

export function weatherTagLabel(tag: string): string {
  switch (tag) {
    case 'outdoor-good':
      return 'good outdoor weather';
    case 'outdoor-fair':
      return 'fair outdoor weather';
    case 'outdoor-poor':
      return 'indoor weather';
    default:
      return tag.replace(/-/g, ' ');
  }
}
