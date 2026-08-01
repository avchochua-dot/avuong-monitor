/**
 * api/mobile-rain.js
 *
 * API gộp dự báo mưa:
 * - Open-Meteo
 * - OpenWeather
 *
 * URL:
 * /api/mobile-rain?source=openmeteo
 * /api/mobile-rain?source=openweather
 * /api/mobile-rain?source=all
 *
 * Biến môi trường Vercel:
 * - OPENWEATHER_API_KEY
 */

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast";

const OPENWEATHER_URL =
  "https://api.openweathermap.org/data/3.0/onecall";

const STATIONS = [
  {
    code: "NMAV",
    name: "NM A Vương",
    lat: 15.779525,
    lon: 107.682545,
  },
  {
    code: "MR01",
    name: "Đập tràn",
    lat: 15.799722,
    lon: 107.61667,
  },
  {
    code: "MR02",
    name: "Tr.Tiểu học & TH b.trú Dang",
    lat: 15.828689,
    lon: 107.559727,
  },
  {
    code: "MR03",
    name: "UBND xã Tây Giang",
    lat: 15.885485,
    lon: 107.49253,
  },
  {
    code: "MR04",
    name: "Đồn biên phòng A Nông",
    lat: 15.961613,
    lon: 107.46756,
  },
  {
    code: "MR05",
    name: "Kiểm lâm A Tép",
    lat: 15.995892,
    lon: 107.510803,
  },
  {
    code: "MR06",
    name: "UBND xã A Vương",
    lat: 15.928032,
    lon: 107.532143,
  },
  {
    code: "MR07",
    name: "Tr.Tiểu học b.trú A Vương",
    lat: 15.943821,
    lon: 107.566262,
  },
  {
    code: "MR08",
    name: "Tr.Tiểu học A Rooih",
    lat: 15.867412,
    lon: 107.61396,
  },
];

/* ======================================================
   RESPONSE
====================================================== */

function sendJson(
  res,
  status,
  payload,
  cacheControl = "no-store"
) {
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Cache-Control",
    cacheControl
  );

  return res
    .status(status)
    .json(payload);
}

/* ======================================================
   RAIN HELPERS
====================================================== */

function levelRain(value) {
  const number =
    Number(value || 0);

  if (number <= 0) {
    return "Không mưa";
  }

  if (number < 10) {
    return "Mưa nhỏ";
  }

  if (number < 25) {
    return "Mưa vừa";
  }

  if (number < 50) {
    return "Mưa to";
  }

  return "Mưa rất to";
}

function keepSmallNumber(value) {
  const number =
    Number(value || 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(
    number.toFixed(3)
  );
}

function sumNumbers(
  values,
  hours
) {
  return values
    .slice(0, hours)
    .reduce(
      (sum, value) =>
        sum + Number(value || 0),
      0
    );
}

function getOpenWeatherHourlyRain(
  row
) {
  return Number(
    row?.rain?.["1h"] || 0
  );
}

/* ======================================================
   FETCH WITH TIMEOUT
====================================================== */

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 15000
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/* ======================================================
   OPEN-METEO
====================================================== */

async function getOpenMeteoStation(
  station
) {
  const params =
    new URLSearchParams({
      latitude:
        String(station.lat),

      longitude:
        String(station.lon),

      hourly:
        "precipitation",

      timezone:
        "Asia/Ho_Chi_Minh",

      forecast_days:
        "4",
    });

  const url =
    `${OPEN_METEO_URL}?${params.toString()}`;

  const response =
    await fetchWithTimeout(
      url,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",
        },
      },
      15000
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Open-Meteo ${response.status}: ` +
      text.slice(0, 300)
    );
  }

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      "Open-Meteo trả dữ liệu không đúng JSON"
    );
  }

  const hourly =
    data.hourly || {};

  const rain =
    Array.isArray(
      hourly.precipitation
    )
      ? hourly.precipitation
      : [];

  const rain24h =
    keepSmallNumber(
      sumNumbers(
        rain,
        24
      )
    );

  const rain48h =
    keepSmallNumber(
      sumNumbers(
        rain,
        48
      )
    );

  const rain72h =
    keepSmallNumber(
      sumNumbers(
        rain,
        72
      )
    );

  const timeRows =
    Array.isArray(
      hourly.time
    )
      ? hourly.time
      : [];

  return {
    code:
      station.code,

    name:
      station.name,

    lat:
      station.lat,

    lon:
      station.lon,

    source:
      "Open-Meteo",

    rain24h,

    rain48h,

    rain72h,

    level24h:
      levelRain(rain24h),

    level48h:
      levelRain(rain48h),

    level72h:
      levelRain(rain72h),

    startTime:
      timeRows[0] || "",

    endTime:
      timeRows[
        Math.min(
          71,
          Math.max(
            0,
            timeRows.length - 1
          )
        )
      ] || "",

    updatedAt:
      new Date()
        .toISOString(),
  };
}

/* ======================================================
   OPENWEATHER
====================================================== */

async function getOpenWeatherStation(
  station
) {
  const key =
    process.env.OPENWEATHER_API_KEY;

  if (!key) {
    throw new Error(
      "Thiếu OPENWEATHER_API_KEY trên Vercel"
    );
  }

  const params =
    new URLSearchParams({
      lat:
        String(station.lat),

      lon:
        String(station.lon),

      appid:
        key,

      units:
        "metric",

      lang:
        "vi",

      exclude:
        "minutely,current,alerts",
    });

  const url =
    `${OPENWEATHER_URL}?${params.toString()}`;

  const response =
    await fetchWithTimeout(
      url,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",
        },
      },
      15000
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenWeather ${response.status}: ` +
      text.slice(0, 300)
    );
  }

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      "OpenWeather trả dữ liệu không đúng JSON"
    );
  }

  const hourly =
    Array.isArray(
      data.hourly
    )
      ? data.hourly
      : [];

  const daily =
    Array.isArray(
      data.daily
    )
      ? data.daily
      : [];

  const rain24h =
    keepSmallNumber(
      hourly
        .slice(0, 24)
        .reduce(
          (sum, row) =>
            sum +
            getOpenWeatherHourlyRain(row),
          0
        )
    );

  const rain48h =
    keepSmallNumber(
      hourly
        .slice(0, 48)
        .reduce(
          (sum, row) =>
            sum +
            getOpenWeatherHourlyRain(row),
          0
        )
    );

  /*
    OpenWeather One Call thường chỉ có
    dữ liệu hourly khoảng 48 giờ.

    Tổng 72 giờ lấy từ trường daily.rain
    của 3 ngày đầu nếu có.
  */
  const rain72hDaily =
    daily
      .slice(0, 3)
      .reduce(
        (sum, row) =>
          sum +
          Number(
            row?.rain || 0
          ),
        0
      );

  const rain72h =
    keepSmallNumber(
      rain72hDaily ||
      rain48h
    );

  return {
    code:
      station.code,

    name:
      station.name,

    lat:
      station.lat,

    lon:
      station.lon,

    source:
      "OpenWeather",

    rain24h,

    rain48h,

    rain72h,

    level24h:
      levelRain(rain24h),

    level48h:
      levelRain(rain48h),

    level72h:
      levelRain(rain72h),

    timezone:
      data.timezone || "",

    timezoneOffset:
      data.timezone_offset ?? null,

    updatedAt:
      new Date()
        .toISOString(),
  };
}

/* ======================================================
   CONCURRENCY
====================================================== */

/*
  Chạy theo nhóm nhỏ để tránh gọi đồng thời
  toàn bộ 9 trạm và hạn chế rate limit.
*/
async function mapWithConcurrency(
  items,
  worker,
  concurrency = 3
) {
  const results =
    new Array(
      items.length
    );

  let nextIndex = 0;

  async function runner() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index]
        );
    }
  }

  const runnerCount =
    Math.min(
      concurrency,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          runnerCount,
      },
      () => runner()
    )
  );

  return results;
}

/* ======================================================
   SUMMARY
====================================================== */

function calculateSummary(
  stations,
  hours = 24
) {
  const field =
    hours === 48
      ? "rain48h"
      : hours === 72
        ? "rain72h"
        : "rain24h";

  const validRows =
    stations.filter(
      (row) =>
        Number.isFinite(
          Number(row?.[field])
        )
    );

  if (!validRows.length) {
    return {
      hours,
      stationCount:
        stations.length,

      averageMm:
        null,

      maximumMm:
        null,

      maximumStationCode:
        null,

      maximumStationName:
        null,
    };
  }

  const total =
    validRows.reduce(
      (sum, row) =>
        sum +
        Number(row[field]),
      0
    );

  const maximumRow =
    validRows.reduce(
      (current, row) => {
        if (!current) {
          return row;
        }

        return Number(
          row[field]
        ) >
        Number(
          current[field]
        )
          ? row
          : current;
      },
      null
    );

  return {
    hours,

    stationCount:
      stations.length,

    averageMm:
      keepSmallNumber(
        total /
        validRows.length
      ),

    maximumMm:
      keepSmallNumber(
        maximumRow[field]
      ),

    maximumStationCode:
      maximumRow.code,

    maximumStationName:
      maximumRow.name,
  };
}

/* ======================================================
   LOAD SOURCE
====================================================== */

async function loadSource(
  source
) {
  const worker =
    source === "openweather"
      ? getOpenWeatherStation
      : getOpenMeteoStation;

  try {
    const stations =
      await mapWithConcurrency(
        STATIONS,
        worker,
        3
      );

    return {
      ok: true,

      source,

      stations,

      count:
        stations.length,

      summary: {
        rain24h:
          calculateSummary(
            stations,
            24
          ),

        rain48h:
          calculateSummary(
            stations,
            48
          ),

        rain72h:
          calculateSummary(
            stations,
            72
          ),
      },

      generatedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      ok: false,

      source,

      stations: [],

      count: 0,

      summary: {
        rain24h:
          null,

        rain48h:
          null,

        rain72h:
          null,
      },

      generatedAt:
        new Date()
          .toISOString(),

      error:
        error?.message ||
        "Lỗi nguồn mưa không xác định",
    };
  }
}

/* ======================================================
   API HANDLER
====================================================== */

export default async function handler(
  req,
  res
) {
  if (
    req.method === "OPTIONS"
  ) {
    return sendJson(
      res,
      200,
      {
        ok: true,
      }
    );
  }

  if (
    req.method !== "GET"
  ) {
    return sendJson(
      res,
      405,
      {
        ok: false,

        error:
          "Method not allowed",
      }
    );
  }

  const requestedSource =
    String(
      req.query.source ||
      "all"
    )
      .trim()
      .toLowerCase();

  const allowedSources = [
    "all",
    "openmeteo",
    "openweather",
  ];

  if (
    !allowedSources.includes(
      requestedSource
    )
  ) {
    return sendJson(
      res,
      400,
      {
        ok: false,

        error:
          "source chỉ nhận all, openmeteo hoặc openweather",
      }
    );
  }

  const sources =
    requestedSource === "all"
      ? [
          "openmeteo",
          "openweather",
        ]
      : [
          requestedSource,
        ];

  const settled =
    await Promise.all(
      sources.map(
        (source) =>
          loadSource(source)
      )
    );

  const result = {};

  for (
    const item
    of settled
  ) {
    result[item.source] =
      item;
  }

  const successfulCount =
    settled.filter(
      (item) =>
        item.ok
    ).length;

  const responseStatus =
    successfulCount > 0
      ? 200
      : 502;

  return sendJson(
    res,
    responseStatus,
    {
      ok:
        successfulCount > 0,

      partial:
        successfulCount !==
        settled.length,

      mode:
        "mobile-rain",

      requestedSource,

      generatedAt:
        new Date()
          .toISOString(),

      sources:
        result,
    },

    "public, s-maxage=1800, stale-while-revalidate=3600"
  );
}
