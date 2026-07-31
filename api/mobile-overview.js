/**
 * api/mobile-overview.js
 *
 * API tổng hợp dữ liệu cho tab Tổng quan của PWA.
 *
 * Biến môi trường cần có trên Vercel:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Frontend phải gửi:
 * Authorization: Bearer <supabase_access_token>
 */

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const RESERVOIR = {
  WL_CHECK_M: 382.2,
  WL_NORMAL_M: 380.0,
  WL_FLOOD_MAX_M: 376.0,
  WL_FLOOD_MIN_M: 370.0,
  WL_DEAD_M: 340.0,

  VOL_DEAD_MILLION_M3: 77.07,
  VOL_MAX_MILLION_M3: 343.55,
};

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

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
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Cache-Control",
    cacheControl
  );

  return res.status(status).json(payload);
}

/* ======================================================
   BASIC HELPERS
====================================================== */

function toNumber(value, fallback = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function round(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const power = 10 ** digits;

  return (
    Math.round(number * power) /
    power
  );
}

function average(values) {
  const valid = values
    .map((value) => Number(value))
    .filter(Number.isFinite);

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (sum, value) => sum + value,
      0
    ) / valid.length
  );
}

function sum(values) {
  return values
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .reduce(
      (total, value) => total + value,
      0
    );
}

/* ======================================================
   AUTH
====================================================== */

function getBearerToken(req) {
  const authorization = String(
    req.headers.authorization || ""
  ).trim();

  const match = authorization.match(
    /^Bearer\s+(.+)$/i
  );

  return match
    ? match[1].trim()
    : "";
}

function requireServerEnvironment() {
  if (!SUPABASE_URL) {
    throw new Error(
      "Thiếu SUPABASE_URL trên Vercel"
    );
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Thiếu SUPABASE_SERVICE_ROLE_KEY trên Vercel"
    );
  }
}

async function verifySupabaseUser(
  accessToken
) {
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Thiếu access token",
    };
  }

  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",

      headers: {
        apikey:
          SUPABASE_SERVICE_ROLE_KEY,

        Authorization:
          `Bearer ${accessToken}`,
      },
    }
  );

  const bodyText =
    await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: 401,

      error:
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",

      detail:
        bodyText.slice(0, 300),
    };
  }

  let user = null;

  try {
    user = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      status: 401,

      error:
        "Không đọc được thông tin người dùng",
    };
  }

  return {
    ok: true,
    user,
  };
}

/* ======================================================
   SUPABASE REST
====================================================== */

async function supabaseSelect(
  table,
  params = {}
) {
  const search =
    new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      search.append(
        key,
        String(value)
      );
    }
  }

  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    (
      search.toString()
        ? `?${search.toString()}`
        : ""
    );

  const response = await fetch(
    url,
    {
      method: "GET",

      headers: {
        apikey:
          SUPABASE_SERVICE_ROLE_KEY,

        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

        Accept:
          "application/json",
      },
    }
  );

  const bodyText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase SELECT ${table} ` +
      `${response.status}: ` +
      bodyText.slice(0, 500)
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(
      `Supabase trả dữ liệu không hợp lệ từ ${table}`
    );
  }
}

/* ======================================================
   DATA HELPERS
====================================================== */

function uniqueByTime(
  rows,
  timeKey
) {
  const map = new Map();

  [...(rows || [])]
    .sort((a, b) => {
      const timeDiff =
        new Date(
          b?.[timeKey] || 0
        ).getTime() -
        new Date(
          a?.[timeKey] || 0
        ).getTime();

      if (timeDiff !== 0) {
        return timeDiff;
      }

      return (
        new Date(
          b?.created_at || 0
        ).getTime() -
        new Date(
          a?.created_at || 0
        ).getTime()
      );
    })
    .forEach((row) => {
      const key =
        row?.[timeKey];

      if (
        key &&
        !map.has(key)
      ) {
        map.set(
          key,
          row
        );
      }
    });

  return [
    ...map.values(),
  ].sort(
    (a, b) =>
      new Date(
        a?.[timeKey] || 0
      ).getTime() -
      new Date(
        b?.[timeKey] || 0
      ).getTime()
  );
}

function getLocalDateKey(date) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          VN_TIME_ZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    ).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (
      part.type !== "literal"
    ) {
      values[part.type] =
        part.value;
    }
  }

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}

function getPreviousDateKey(date) {
  const shifted = new Date(
    date.getTime() -
    24 * 60 * 60 * 1000
  );

  return getLocalDateKey(
    shifted
  );
}

function getRainValue(row) {
  return toNumber(
    row?.rainfallreal ??
    row?.rainfall_real ??
    row?.rainfall_mm ??
    row?.rain_mm,
    0
  );
}

/* ======================================================
   STORAGE
====================================================== */

function getCurrentStorage(
  storageRow,
  waterLevel
) {
  const direct = toNumber(
    storageRow?.volume ??
    storageRow?.current_volume ??
    storageRow?.storage_million_m3,
    null
  );

  if (direct !== null) {
    return direct;
  }

  if (
    !Number.isFinite(
      waterLevel
    )
  ) {
    return null;
  }

  if (
    waterLevel <=
    RESERVOIR.WL_DEAD_M
  ) {
    return (
      RESERVOIR
        .VOL_DEAD_MILLION_M3
    );
  }

  if (
    waterLevel >=
    RESERVOIR.WL_NORMAL_M
  ) {
    return (
      RESERVOIR
        .VOL_MAX_MILLION_M3
    );
  }

  const ratio =
    (
      waterLevel -
      RESERVOIR.WL_DEAD_M
    ) /
    (
      RESERVOIR.WL_NORMAL_M -
      RESERVOIR.WL_DEAD_M
    );

  return (
    RESERVOIR
      .VOL_DEAD_MILLION_M3 +
    ratio *
    (
      RESERVOIR
        .VOL_MAX_MILLION_M3 -
      RESERVOIR
        .VOL_DEAD_MILLION_M3
    )
  );
}

function volumeToWaterLevel(
  volume
) {
  if (
    !Number.isFinite(volume)
  ) {
    return null;
  }

  if (
    volume <=
    RESERVOIR
      .VOL_DEAD_MILLION_M3
  ) {
    return (
      RESERVOIR.WL_DEAD_M
    );
  }

  if (
    volume >=
    RESERVOIR
      .VOL_MAX_MILLION_M3
  ) {
    return (
      RESERVOIR.WL_NORMAL_M
    );
  }

  return (
    RESERVOIR.WL_DEAD_M +
    (
      volume -
      RESERVOIR
        .VOL_DEAD_MILLION_M3
    ) *
    (
      RESERVOIR.WL_NORMAL_M -
      RESERVOIR.WL_DEAD_M
    ) /
    (
      RESERVOIR
        .VOL_MAX_MILLION_M3 -
      RESERVOIR
        .VOL_DEAD_MILLION_M3
    )
  );
}

/* ======================================================
   DATA STATUS
====================================================== */

function getDataFreshness(
  updatedAt
) {
  if (!updatedAt) {
    return {
      status:
        "unknown",

      age_minutes:
        null,

      message:
        "Không xác định thời gian cập nhật",
    };
  }

  const time =
    new Date(
      updatedAt
    ).getTime();

  if (
    !Number.isFinite(time)
  ) {
    return {
      status:
        "unknown",

      age_minutes:
        null,

      message:
        "Thời gian cập nhật không hợp lệ",
    };
  }

  const ageMinutes =
    Math.max(
      0,
      Math.round(
        (
          Date.now() -
          time
        ) / 60000
      )
    );

  if (
    ageMinutes <= 15
  ) {
    return {
      status:
        "fresh",

      age_minutes:
        ageMinutes,

      message:
        "Dữ liệu mới",
    };
  }

  if (
    ageMinutes <= 60
  ) {
    return {
      status:
        "warning",

      age_minutes:
        ageMinutes,

      message:
        `Dữ liệu đã cũ ${ageMinutes} phút`,
    };
  }

  return {
    status:
      "stale",

    age_minutes:
      ageMinutes,

    message:
      `Dữ liệu đã cũ ${ageMinutes} phút`,
  };
}

function getSafetyStatus(
  waterLevel,
  freshness
) {
  if (
    !Number.isFinite(
      waterLevel
    )
  ) {
    return {
      code:
        "unknown",

      label:
        "CHƯA CÓ DỮ LIỆU",
    };
  }

  if (
    freshness?.status ===
    "stale"
  ) {
    return {
      code:
        "stale",

      label:
        "DỮ LIỆU QUÁ HẠN",
    };
  }

  if (
    waterLevel >=
    RESERVOIR.WL_CHECK_M
  ) {
    return {
      code:
        "danger",

      label:
        "NGUY HIỂM",
    };
  }

  if (
    waterLevel >=
    RESERVOIR.WL_FLOOD_MAX_M
  ) {
    return {
      code:
        "warning",

      label:
        "CẢNH BÁO",
    };
  }

  return {
    code:
      "normal",

    label:
      "BÌNH THƯỜNG",
  };
}

/* ======================================================
   INFLOW FORECAST
====================================================== */

function getForecastValue(row) {
  return toNumber(
    row?.inflow_m3s ??
    row?.q_in_m3s ??
    row?.q_routed_m3s,
    null
  );
}

function calculateForecastSummary({
  forecastRows,
  currentStorage,
  currentOutflow,
}) {
  const grouped =
    new Map();

  for (
    const row
    of forecastRows || []
  ) {
    const source =
      String(
        row?.source ||
        "unknown"
      );

    if (
      !grouped.has(source)
    ) {
      grouped.set(
        source,
        []
      );
    }

    grouped
      .get(source)
      .push(row);
  }

  let qAverageMin =
    Infinity;

  let qAverageMax =
    -Infinity;

  let volume24Min =
    Infinity;

  let volume24Max =
    -Infinity;

  let waterLevel24Min =
    Infinity;

  let waterLevel24Max =
    -Infinity;

  let volume7dMin =
    Infinity;

  let volume7dMax =
    -Infinity;

  let waterLevel7dMin =
    Infinity;

  let waterLevel7dMax =
    -Infinity;

  for (
    const rows
    of grouped.values()
  ) {
    const normalized =
      uniqueByTime(
        rows,
        "forecast_time"
      )
        .map((row) => ({
          time:
            row.forecast_time,

          value:
            getForecastValue(
              row
            ),
        }))
        .filter((row) =>
          Number.isFinite(
            row.value
          )
        );

    if (
      !normalized.length
    ) {
      continue;
    }

    const flows =
      normalized.map(
        (row) => row.value
      );

    const averageFlow =
      average(flows);

    qAverageMin =
      Math.min(
        qAverageMin,
        averageFlow
      );

    qAverageMax =
      Math.max(
        qAverageMax,
        averageFlow
      );

    const first24 =
      flows.slice(
        0,
        24
      );

    const volumeIn24 =
      sum(first24) *
      3600 /
      1_000_000;

    const finalVolume24 =
      Number.isFinite(
        currentStorage
      )
        ? Math.max(
            RESERVOIR
              .VOL_DEAD_MILLION_M3,

            Math.min(
              RESERVOIR
                .VOL_MAX_MILLION_M3,

              currentStorage +
              volumeIn24 -
              currentOutflow *
              first24.length *
              3600 /
              1_000_000
            )
          )
        : null;

    const waterLevel24 =
      volumeToWaterLevel(
        finalVolume24
      );

    volume24Min =
      Math.min(
        volume24Min,
        volumeIn24
      );

    volume24Max =
      Math.max(
        volume24Max,
        volumeIn24
      );

    if (
      Number.isFinite(
        waterLevel24
      )
    ) {
      waterLevel24Min =
        Math.min(
          waterLevel24Min,
          waterLevel24
        );

      waterLevel24Max =
        Math.max(
          waterLevel24Max,
          waterLevel24
        );
    }

    const volumeIn7d =
      sum(flows) *
      3600 /
      1_000_000;

    const finalVolume7d =
      Number.isFinite(
        currentStorage
      )
        ? Math.max(
            RESERVOIR
              .VOL_DEAD_MILLION_M3,

            Math.min(
              RESERVOIR
                .VOL_MAX_MILLION_M3,

              currentStorage +
              volumeIn7d -
              currentOutflow *
              flows.length *
              3600 /
              1_000_000
            )
          )
        : null;

    const waterLevel7d =
      volumeToWaterLevel(
        finalVolume7d
      );

    volume7dMin =
      Math.min(
        volume7dMin,
        volumeIn7d
      );

    volume7dMax =
      Math.max(
        volume7dMax,
        volumeIn7d
      );

    if (
      Number.isFinite(
        waterLevel7d
      )
    ) {
      waterLevel7dMin =
        Math.min(
          waterLevel7dMin,
          waterLevel7d
        );

      waterLevel7dMax =
        Math.max(
          waterLevel7dMax,
          waterLevel7d
        );
    }
  }

  function finiteOrNull(
    value
  ) {
    return Number.isFinite(
      value
    )
      ? round(value, 2)
      : null;
  }

  return {
    source_count:
      grouped.size,

    q_average_m3s: {
      min:
        finiteOrNull(
          qAverageMin
        ),

      max:
        finiteOrNull(
          qAverageMax
        ),
    },

    inflow_volume_24h_million_m3: {
      min:
        finiteOrNull(
          volume24Min
        ),

      max:
        finiteOrNull(
          volume24Max
        ),
    },

    water_level_24h_m: {
      min:
        finiteOrNull(
          waterLevel24Min
        ),

      max:
        finiteOrNull(
          waterLevel24Max
        ),
    },

    inflow_volume_7d_million_m3: {
      min:
        finiteOrNull(
          volume7dMin
        ),

      max:
        finiteOrNull(
          volume7dMax
        ),
    },

    water_level_7d_m: {
      min:
        finiteOrNull(
          waterLevel7dMin
        ),

      max:
        finiteOrNull(
          waterLevel7dMax
        ),
    },
  };
}

/* ======================================================
   RAIN FORECAST
====================================================== */

function calculateRainForecastSummary(
  rows
) {
  const bySourceAndDay =
    new Map();

  for (
    const row
    of rows || []
  ) {
    const time =
      row?.forecast_time;

    if (!time) {
      continue;
    }

    const day =
      getLocalDateKey(
        new Date(time)
      );

    const source =
      String(
        row?.source ||
        "unknown"
      );

    const key =
      `${source}|${day}`;

    bySourceAndDay.set(
      key,

      (
        bySourceAndDay.get(
          key
        ) || 0
      ) +
      toNumber(
        row?.rainfall_mm,
        0
      )
    );
  }

  const values =
    [
      ...bySourceAndDay.values(),
    ].filter(
      Number.isFinite
    );

  return {
    daily_mm: {
      min:
        values.length
          ? round(
              Math.min(
                ...values
              ),
              1
            )
          : null,

      max:
        values.length
          ? round(
              Math.max(
                ...values
              ),
              1
            )
          : null,
    },
  };
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

  try {
    requireServerEnvironment();

    const accessToken =
      getBearerToken(req);

    const auth =
      await verifySupabaseUser(
        accessToken
      );

    if (!auth.ok) {
      return sendJson(
        res,
        auth.status,
        {
          ok: false,
          error:
            auth.error,
        }
      );
    }

    const now =
      new Date();

    const start8d =
      new Date(
        now.getTime() -
        8 *
        24 *
        60 *
        60 *
        1000
      );

    const [
      reservoirRowsRaw,
      storageRows,
      inflowForecastRows,
      rainfallForecastRows,
    ] = await Promise.all([
      supabaseSelect(
        "reservoir_hourly_data",
        {
          select: "*",

          time:
            `gte.${start8d.toISOString()}`,

          order:
            "time.asc",

          limit:
            500,
        }
      ),

      supabaseSelect(
        "v_current_storage",
        {
          select: "*",

          order:
            "time.desc",

          limit:
            1,
        }
      ),

      supabaseSelect(
        "inflow_forecast",
        {
          select:
            "forecast_time," +
            "source," +
            "inflow_m3s," +
            "q_in_m3s," +
            "q_routed_m3s," +
            "created_at",

          forecast_time:
            `gte.${now.toISOString()}`,

          order:
            "forecast_time.asc",

          limit:
            5000,
        }
      ),

      supabaseSelect(
        "rainfall_forecast",
        {
          select:
            "forecast_time," +
            "source," +
            "rainfall_mm," +
            "created_at",

          forecast_time:
            `gte.${now.toISOString()}`,

          order:
            "forecast_time.asc",

          limit:
            5000,
        }
      ),
    ]);

    const reservoirRows =
      uniqueByTime(
        reservoirRowsRaw,
        "time"
      );

    const latest =
      reservoirRows[
        reservoirRows.length - 1
      ] || null;

    if (!latest) {
      return sendJson(
        res,
        404,
        {
          ok: false,

          error:
            "Không có dữ liệu trong reservoir_hourly_data",
        }
      );
    }

    const latestTime =
      new Date(
        latest.time
      );

    const rows24h =
      reservoirRows.filter(
        (row) =>
          new Date(
            row.time
          ).getTime() >=
          latestTime.getTime() -
          24 *
          60 *
          60 *
          1000
      );

    const rows7d =
      reservoirRows.filter(
        (row) =>
          new Date(
            row.time
          ).getTime() >=
          latestTime.getTime() -
          7 *
          24 *
          60 *
          60 *
          1000
      );

    const waterLevel =
      toNumber(
        latest.water_level
      );

    const inflow =
      toNumber(
        latest.inflow
      );

    const turbineFlow =
      toNumber(
        latest.turbine_flow
      );

    const spillwayFlow =
      toNumber(
        latest.spillway_flow,
        0
      );

    const storage =
      getCurrentStorage(
        storageRows?.[0] ||
        null,

        waterLevel
      );

    const usefulCapacity =
      RESERVOIR
        .VOL_MAX_MILLION_M3 -
      RESERVOIR
        .VOL_DEAD_MILLION_M3;

    const usefulVolume =
      Number.isFinite(
        storage
      )
        ? Math.max(
            0,

            storage -
            RESERVOIR
              .VOL_DEAD_MILLION_M3
          )
        : null;

    const emptyToNormal =
      Number.isFinite(
        storage
      )
        ? Math.max(
            0,

            RESERVOIR
              .VOL_MAX_MILLION_M3 -
            storage
          )
        : null;

    const pctTotal =
      Number.isFinite(
        storage
      )
        ? storage /
          RESERVOIR
            .VOL_MAX_MILLION_M3 *
          100
        : null;

    const pctUseful =
      Number.isFinite(
        usefulVolume
      )
        ? usefulVolume /
          usefulCapacity *
          100
        : null;

    const earliest24 =
      rows24h.length > 1
        ? rows24h[0]
        : null;

    const delta24h =
      Number.isFinite(
        waterLevel
      ) &&
      Number.isFinite(
        toNumber(
          earliest24?.water_level
        )
      )
        ? waterLevel -
          Number(
            earliest24.water_level
          )
        : null;

    const currentDay =
      getLocalDateKey(
        latestTime
      );

    const previousDay =
      getPreviousDateKey(
        latestTime
      );

    const rainDay =
      sum(
        reservoirRows
          .filter(
            (row) =>
              getLocalDateKey(
                new Date(
                  row.time
                )
              ) ===
              currentDay
          )
          .map(
            getRainValue
          )
      );

    const rainD1 =
      sum(
        reservoirRows
          .filter(
            (row) =>
              getLocalDateKey(
                new Date(
                  row.time
                )
              ) ===
              previousDay
          )
          .map(
            getRainValue
          )
      );

    const freshness =
      getDataFreshness(
        latest.time
      );

    const safety =
      getSafetyStatus(
        waterLevel,
        freshness
      );

    const currentOutflow =
      toNumber(
        turbineFlow,
        0
      ) +
      toNumber(
        spillwayFlow,
        0
      );

    const forecastSummary =
      calculateForecastSummary({
        forecastRows:
          inflowForecastRows,

        currentStorage:
          storage,

        currentOutflow,
      });

    const rainForecastSummary =
      calculateRainForecastSummary(
        rainfallForecastRows
      );

    return sendJson(
      res,
      200,
      {
        ok: true,

        mode:
          "mobile-overview",

        generated_at:
          new Date()
            .toISOString(),

        user: {
          id:
            auth.user?.id ||
            null,

          email:
            auth.user?.email ||
            null,
        },

        data_status: {
          latest_time:
            latest.time,

          freshness,
        },

        safety: {
          ...safety,

          water_level_m:
            round(
              waterLevel,
              2
            ),

          thresholds: {
            check_m:
              RESERVOIR
                .WL_CHECK_M,

            normal_m:
              RESERVOIR
                .WL_NORMAL_M,

            flood_max_m:
              RESERVOIR
                .WL_FLOOD_MAX_M,

            flood_min_m:
              RESERVOIR
                .WL_FLOOD_MIN_M,

            dead_m:
              RESERVOIR
                .WL_DEAD_M,
          },

          differences_m: {
            to_check:
              round(
                waterLevel -
                RESERVOIR
                  .WL_CHECK_M,
                2
              ),

            to_normal:
              round(
                waterLevel -
                RESERVOIR
                  .WL_NORMAL_M,
                2
              ),

            to_flood_max:
              round(
                waterLevel -
                RESERVOIR
                  .WL_FLOOD_MAX_M,
                2
              ),

            to_flood_min:
              round(
                waterLevel -
                RESERVOIR
                  .WL_FLOOD_MIN_M,
                2
              ),

            above_dead:
              round(
                waterLevel -
                RESERVOIR
                  .WL_DEAD_M,
                2
              ),
          },
        },

        current: {
          water_level_m:
            round(
              waterLevel,
              2
            ),

          inflow_m3s:
            round(
              inflow,
              2
            ),

          turbine_flow_m3s:
            round(
              turbineFlow,
              2
            ),

          spillway_flow_m3s:
            round(
              spillwayFlow,
              2
            ),

          rain_1h_mm:
            round(
              getRainValue(
                latest
              ),
              1
            ),
        },

        averages: {
          inflow_24h_m3s:
            round(
              average(
                rows24h.map(
                  (row) =>
                    row.inflow
                )
              ),
              2
            ),

          turbine_24h_m3s:
            round(
              average(
                rows24h.map(
                  (row) =>
                    row.turbine_flow
                )
              ),
              2
            ),

          spillway_24h_m3s:
            round(
              average(
                rows24h.map(
                  (row) =>
                    row.spillway_flow
                )
              ),
              2
            ),

          inflow_7d_m3s:
            round(
              average(
                rows7d.map(
                  (row) =>
                    row.inflow
                )
              ),
              2
            ),

          water_level_delta_24h_m:
            round(
              delta24h,
              2
            ),
        },

        storage: {
          volume_million_m3:
            round(
              storage,
              2
            ),

          total_percent:
            round(
              pctTotal,
              2
            ),

          useful_percent:
            round(
              pctUseful,
              2
            ),

          useful_remaining_million_m3:
            round(
              usefulVolume,
              2
            ),

          empty_to_normal_million_m3:
            round(
              emptyToNormal,
              2
            ),
        },

        rain: {
          current_day:
            currentDay,

          previous_day:
            previousDay,

          rain_1h_mm:
            round(
              getRainValue(
                latest
              ),
              1
            ),

          rain_day_mm:
            round(
              rainDay,
              1
            ),

          rain_d1_mm:
            round(
              rainD1,
              1
            ),
        },

        forecast: {
          inflow:
            forecastSummary,

          rain:
            rainForecastSummary,

          hydrology_frequency: {
            percent:
              null,

            group:
              null,

            note:
              "Chưa nối nguồn dữ liệu tần suất thủy văn",
          },

          dead_level: {
            status:
              null,

            days:
              null,

            note:
              "Chưa nối nguồn dữ liệu dự báo MN chết",
          },
        },

        coverage: {
          reservoir_rows_24h:
            rows24h.length,

          reservoir_rows_7d:
            rows7d.length,

          inflow_forecast_rows:
            inflowForecastRows.length,

          rainfall_forecast_rows:
            rainfallForecastRows.length,
        },
      },

      "private, max-age=0, s-maxage=60, stale-while-revalidate=120"
    );
  } catch (error) {
    console.error(
      "mobile-overview error:",
      error
    );

    return sendJson(
      res,
      500,
      {
        ok: false,

        mode:
          "mobile-overview",

        error:
          error?.message ||
          "Lỗi máy chủ không xác định",
      }
    );
  }
}
