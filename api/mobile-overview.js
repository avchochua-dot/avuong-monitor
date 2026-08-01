/**
 * api/mobile-overview.js
 *
 * API tổng hợp dữ liệu cho tab Tổng quan của PWA.
 *
 * Giữ nguyên logic API cũ:
 * - Dữ liệu vận hành hồ.
 * - Dung tích thực từ v_current_storage.
 * - Mưa, dự báo, an toàn hồ.
 *
 * Chỉ bổ sung:
 * - Tần suất thủy văn.
 * - Dự báo thời gian chạm mực nước chết.
 *
 * Biến môi trường cần có trên Vercel:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Frontend phải gửi:
 * Authorization: Bearer <supabase_access_token>
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

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

const VN_TIME_ZONE =
  "Asia/Ho_Chi_Minh";

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

  return res
    .status(status)
    .json(payload);
}

/* ======================================================
   HELPERS
====================================================== */

function toNumber(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function round(
  value,
  digits = 2
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const factor =
    10 ** digits;

  return (
    Math.round(number * factor) /
    factor
  );
}

function average(
  values = []
) {
  const valid =
    values
      .map((value) =>
        Number(value)
      )
      .filter(
        Number.isFinite
      );

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    valid.length
  );
}

function sum(
  values = []
) {
  return values
    .map((value) =>
      Number(value)
    )
    .filter(
      Number.isFinite
    )
    .reduce(
      (total, value) =>
        total + value,
      0
    );
}

function uniqueByTime(
  rows,
  field = "time"
) {
  const map =
    new Map();

  for (
    const row
    of rows || []
  ) {
    const key =
      row?.[field];

    if (!key) {
      continue;
    }

    map.set(
      String(key),
      row
    );
  }

  return [
    ...map.values(),
  ].sort(
    (a, b) =>
      String(
        a?.[field] || ""
      ).localeCompare(
        String(
          b?.[field] || ""
        )
      )
  );
}

/* ======================================================
   AUTH
====================================================== */

function getBearerToken(req) {
  const authorization =
    String(
      req.headers.authorization ||
      ""
    ).trim();

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : "";
}

function requireEnvironment() {
  if (!SUPABASE_URL) {
    throw new Error(
      "Thiếu SUPABASE_URL trên Vercel"
    );
  }

  if (
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
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
      error:
        "Thiếu access token",
    };
  }

  const response =
    await fetch(
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

  const text =
    await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: 401,
      error:
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
    };
  }

  try {
    return {
      ok: true,
      user:
        JSON.parse(text),
    };
  } catch {
    return {
      ok: false,
      status: 401,
      error:
        "Không đọc được thông tin người dùng",
    };
  }
}

/* ======================================================
   SUPABASE REST
====================================================== */

async function supabaseSelect(
  table,
  params = {}
) {
  const query =
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
      query.append(
        key,
        String(value)
      );
    }
  }

  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    (
      query.toString()
        ? `?${query.toString()}`
        : ""
    );

  const response =
    await fetch(
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

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase SELECT ${table} ` +
      `${response.status}: ` +
      text.slice(0, 800)
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Supabase trả dữ liệu không hợp lệ từ ${table}`
    );
  }
}

/* ======================================================
   TIME HELPERS
====================================================== */

function parseReservoirOperationalTime(
  value
) {
  const text =
    String(value || "").trim();

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
    );

  if (!match) {
    return null;
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = "00",
  ] = match;

  const date =
    new Date(
      `${year}-${month}-${day}` +
      `T${hour}:${minute}:${second}+07:00`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function getReservoirLiteralDateKey(
  value
) {
  const text =
    String(value || "").trim();

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ]/
    );

  if (!match) {
    return null;
  }

  return (
    `${match[1]}-` +
    `${match[2]}-` +
    `${match[3]}`
  );
}

function getLocalDateKey(date) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    return null;
  }

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

  const result = {};

  for (const part of parts) {
    if (
      part.type !== "literal"
    ) {
      result[part.type] =
        part.value;
    }
  }

  return (
    `${result.year}-` +
    `${result.month}-` +
    `${result.day}`
  );
}

function getDataFreshness(
  updatedAt
) {
  if (!updatedAt) {
    return {
      status:
        "unknown",

      label:
        "Chưa xác định",

      age_minutes:
        null,
    };
  }

  const operationalDate =
    parseReservoirOperationalTime(
      updatedAt
    );

  const time =
    operationalDate?.getTime();

  if (!Number.isFinite(time)) {
    return {
      status:
        "unknown",

      label:
        "Thời gian không hợp lệ",

      age_minutes:
        null,
    };
  }

  const ageMinutes =
    Math.max(
      0,
      Math.round(
        (
          Date.now() -
          time
        ) /
        60000
      )
    );

  if (ageMinutes <= 90) {
    return {
      status:
        "fresh",

      label:
        "Vừa cập nhật",

      age_minutes:
        ageMinutes,
    };
  }

  if (ageMinutes <= 360) {
    return {
      status:
        "warning",

      label:
        "Dữ liệu đang chậm",

      age_minutes:
        ageMinutes,
    };
  }

  return {
    status:
      "stale",

    label:
      "Dữ liệu cũ",

    age_minutes:
      ageMinutes,
  };
}

/* ======================================================
   RAIN
====================================================== */

function getRainValue(row) {
  const candidates = [
    row?.rain_1h,
    row?.rainfall,
    row?.rain,
    row?.rain_mm,
  ];

  for (
    const value
    of candidates
  ) {
    const number =
      toNumber(value);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return 0;
}

/* ======================================================
   STORAGE
====================================================== */

function getStorageValue(
  row
) {
  if (!row) {
    return null;
  }

  const candidates = [
    row.volume,
    row.current_volume,
    row.storage_million_m3,
    row.volume_million_m3,
    row.storage,
    row.v,
  ];

  for (
    const value
    of candidates
  ) {
    const number =
      toNumber(value);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return null;
}

function calculateStorageSummary(
  storageMillionM3
) {
  const storage =
    toNumber(
      storageMillionM3
    );

  if (
    !Number.isFinite(storage)
  ) {
    return {
      volume_million_m3:
        null,

      total_percent:
        null,

      useful_percent:
        null,

      useful_remaining_million_m3:
        null,

      empty_to_normal_million_m3:
        null,
    };
  }

  const usefulCapacity =
    RESERVOIR
      .VOL_MAX_MILLION_M3 -
    RESERVOIR
      .VOL_DEAD_MILLION_M3;

  const usefulStored =
    Math.max(
      0,
      storage -
      RESERVOIR
        .VOL_DEAD_MILLION_M3
    );

  const usefulRemaining =
    Math.max(
      0,
      usefulCapacity -
      usefulStored
    );

  const emptyToNormal =
    Math.max(
      0,
      RESERVOIR
        .VOL_MAX_MILLION_M3 -
      storage
    );

  return {
    volume_million_m3:
      round(
        storage,
        2
      ),

    total_percent:
      round(
        storage /
        RESERVOIR
          .VOL_MAX_MILLION_M3 *
        100,
        2
      ),

    useful_percent:
      round(
        usefulStored /
        usefulCapacity *
        100,
        2
      ),

    useful_remaining_million_m3:
      round(
        usefulRemaining,
        2
      ),

    empty_to_normal_million_m3:
      round(
        emptyToNormal,
        2
      ),
  };
}

/* ======================================================
   SAFETY
====================================================== */

function calculateSafetySummary(
  waterLevel
) {
  const level =
    Number(waterLevel);

  if (!Number.isFinite(level)) {
    return {
      status:
        "Chưa có dữ liệu",

      code:
        "unknown",
    };
  }

  let status =
    "Bình thường";

  let code =
    "normal";

  if (
    level >=
    RESERVOIR.WL_CHECK_M
  ) {
    status =
      "Vượt MN kiểm tra";

    code =
      "danger";
  } else if (
    level >=
    RESERVOIR.WL_NORMAL_M
  ) {
    status =
      "Trên MNDBT";

    code =
      "warning";
  } else if (
    level >=
    RESERVOIR.WL_FLOOD_MAX_M
  ) {
    status =
      "Vùng cao trước lũ";

    code =
      "watch";
  }

  return {
    status,
    code,

    current_water_level_m:
      round(
        level,
        2
      ),

    check_level_m:
      RESERVOIR.WL_CHECK_M,

    normal_level_m:
      RESERVOIR.WL_NORMAL_M,

    flood_max_level_m:
      RESERVOIR.WL_FLOOD_MAX_M,

    flood_min_level_m:
      RESERVOIR.WL_FLOOD_MIN_M,

    dead_level_m:
      RESERVOIR.WL_DEAD_M,

    distance_to_check_m:
      round(
        RESERVOIR.WL_CHECK_M -
        level,
        2
      ),

    distance_to_normal_m:
      round(
        RESERVOIR.WL_NORMAL_M -
        level,
        2
      ),

    distance_to_flood_max_m:
      round(
        RESERVOIR.WL_FLOOD_MAX_M -
        level,
        2
      ),

    distance_to_flood_min_m:
      round(
        RESERVOIR.WL_FLOOD_MIN_M -
        level,
        2
      ),

    distance_above_dead_m:
      round(
        level -
        RESERVOIR.WL_DEAD_M,
        2
      ),
  };
}

/* ======================================================
   FORECAST SUMMARY
====================================================== */

function calculateForecastSummary({
  currentWaterLevel,
  forecastRows,
}) {
  if (
    !Array.isArray(
      forecastRows
    ) ||
    !forecastRows.length
  ) {
    return {
      available:
        false,

      max_inflow_m3s:
        null,

      average_inflow_m3s:
        null,

      latest_forecast_time:
        null,
    };
  }

  const inflows =
    forecastRows
      .map(
        (row) =>
          toNumber(
            row.inflow_m3s ??
            row.q_in_m3s ??
            row.inflow
          )
      )
      .filter(
        Number.isFinite
      );

  if (!inflows.length) {
    return {
      available:
        false,

      max_inflow_m3s:
        null,

      average_inflow_m3s:
        null,

      latest_forecast_time:
        null,
    };
  }

  const latest =
    forecastRows[
      forecastRows.length - 1
    ];

  return {
    available:
      true,

    current_water_level_m:
      round(
        currentWaterLevel,
        2
      ),

    max_inflow_m3s:
      round(
        Math.max(
          ...inflows
        ),
        2
      ),

    average_inflow_m3s:
      round(
        average(inflows),
        2
      ),

    latest_forecast_time:
      latest?.forecast_time ||
      null,
  };
}

/* ======================================================
   HYDROLOGY FREQUENCY
====================================================== */

function getReservoirMonthKey(
  value
) {
  const text =
    String(value || "").trim();

  const match =
    text.match(
      /^(\d{4})-(\d{2})-\d{2}[T ]/
    );

  if (!match) {
    return null;
  }

  return {
    year:
      Number(match[1]),

    month:
      Number(match[2]),

    key:
      `${match[1]}-${match[2]}`,

    startIso:
      `${match[1]}-${match[2]}-01T00:00:00.000Z`,
  };
}

function classifyHydrologyFrequency(
  percent
) {
  const value =
    Number(percent);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (value <= 10) {
    return "Rất nhiều nước";
  }

  if (value <= 25) {
    return "Nhiều nước";
  }

  if (value <= 50) {
    return "Nhóm trung bình";
  }

  if (value <= 75) {
    return "Ít nước";
  }

  return "Rất ít nước";
}

async function calculateHydrologyFrequency({
  latestTime,
  latestMonthRows,
}) {
  const monthInfo =
    getReservoirMonthKey(
      latestTime
    );

  if (!monthInfo) {
    return {
      percent:
        null,

      group:
        null,

      note:
        "Không xác định được tháng vận hành",

      month:
        null,

      average_inflow_m3s:
        null,

      reference_inflow_m3s:
        null,

      sample_count:
        0,
    };
  }

  const monthRows =
    Array.isArray(
      latestMonthRows
    )
      ? latestMonthRows
      : [];

  const monthlyAverage =
    average(
      monthRows.map(
        (row) =>
          row.inflow
      )
    );

  if (
    !Number.isFinite(
      monthlyAverage
    )
  ) {
    return {
      percent:
        null,

      group:
        null,

      note:
        `Chưa đủ dữ liệu Q về tháng ${monthInfo.month}`,

      month:
        monthInfo.month,

      average_inflow_m3s:
        null,

      reference_inflow_m3s:
        null,

      sample_count:
        monthRows.length,
    };
  }

  const frequencyRows =
    await supabaseSelect(
      "monthly_inflow_frequency",
      {
        select:
          "id,frequency_percent,month,inflow_value",

        month:
          `eq.${monthInfo.month}`,

        order:
          "frequency_percent.asc",

        limit:
          500,
      }
    );

  if (
    !Array.isArray(
      frequencyRows
    ) ||
    !frequencyRows.length
  ) {
    return {
      percent:
        null,

      group:
        null,

      note:
        `Không có dữ liệu tần suất tháng ${monthInfo.month}`,

      month:
        monthInfo.month,

      average_inflow_m3s:
        round(
          monthlyAverage,
          2
        ),

      reference_inflow_m3s:
        null,

      sample_count:
        monthRows.length,
    };
  }

  let nearest =
    frequencyRows[0];

  for (
    const row
    of frequencyRows
  ) {
    const currentValue =
      toNumber(
        row.inflow_value
      );

    const nearestValue =
      toNumber(
        nearest.inflow_value
      );

    if (
      !Number.isFinite(
        currentValue
      )
    ) {
      continue;
    }

    if (
      !Number.isFinite(
        nearestValue
      ) ||
      Math.abs(
        currentValue -
        monthlyAverage
      ) <
      Math.abs(
        nearestValue -
        monthlyAverage
      )
    ) {
      nearest =
        row;
    }
  }

  const percent =
    toNumber(
      nearest.frequency_percent
    );

  const referenceInflow =
    toNumber(
      nearest.inflow_value
    );

  return {
    percent:
      round(
        percent,
        2
      ),

    group:
      classifyHydrologyFrequency(
        percent
      ),

    note:
      Number.isFinite(percent)
        ? (
            `Q về TB tháng ${monthInfo.month}: ` +
            `${round(monthlyAverage, 2)} m³/s; ` +
            `gần P=${round(percent, 2)}%`
          )
        : (
            `Không xác định được tần suất tháng ` +
            `${monthInfo.month}`
          ),

    month:
      monthInfo.month,

    average_inflow_m3s:
      round(
        monthlyAverage,
        2
      ),

    reference_inflow_m3s:
      round(
        referenceInflow,
        2
      ),

    sample_count:
      monthRows.length,
  };
}

/* ======================================================
   DEAD LEVEL FORECAST
====================================================== */

function calculateDeadLevelForecast({
  usefulRemainingMillionM3,
  averageInflow24h,
  averageTurbine24h,
}) {
  const usefulVolume =
    toNumber(
      usefulRemainingMillionM3
    );

  const inflow24h =
    toNumber(
      averageInflow24h
    );

  const turbine24h =
    toNumber(
      averageTurbine24h
    );

  if (
    !Number.isFinite(
      usefulVolume
    ) ||
    !Number.isFinite(
      inflow24h
    ) ||
    !Number.isFinite(
      turbine24h
    )
  ) {
    return {
      status:
        "Chưa có dữ liệu",

      code:
        "missing_data",

      days:
        null,

      note:
        "Thiếu dung tích hữu ích hoặc Q trung bình 24h",

      useful_volume_million_m3:
        round(
          usefulVolume,
          2
        ),

      inflow_24h_m3s:
        round(
          inflow24h,
          2
        ),

      turbine_24h_m3s:
        round(
          turbine24h,
          2
        ),

      net_depletion_m3s:
        null,
    };
  }

  if (usefulVolume <= 0) {
    return {
      status:
        "Đã chạm MN chết",

      code:
        "reached_dead_level",

      days:
        0,

      note:
        "Dung tích hữu ích hiện có bằng 0",

      useful_volume_million_m3:
        round(
          usefulVolume,
          2
        ),

      inflow_24h_m3s:
        round(
          inflow24h,
          2
        ),

      turbine_24h_m3s:
        round(
          turbine24h,
          2
        ),

      net_depletion_m3s:
        round(
          turbine24h -
          inflow24h,
          2
        ),
    };
  }

  const netDepletion =
    turbine24h -
    inflow24h;

  if (
    Math.abs(
      netDepletion
    ) < 0.05
  ) {
    return {
      status:
        "Mực nước ổn định",

      code:
        "stable",

      days:
        null,

      note:
        "Q về xấp xỉ Q chạy máy",

      useful_volume_million_m3:
        round(
          usefulVolume,
          2
        ),

      inflow_24h_m3s:
        round(
          inflow24h,
          2
        ),

      turbine_24h_m3s:
        round(
          turbine24h,
          2
        ),

      net_depletion_m3s:
        round(
          netDepletion,
          2
        ),
    };
  }

  if (netDepletion < 0) {
    return {
      status:
        "Mực nước đang tăng",

      code:
        "rising",

      days:
        null,

      note:
        (
          `Q về lớn hơn Q chạy máy ` +
          `${round(
            Math.abs(netDepletion),
            2
          )} m³/s`
        ),

      useful_volume_million_m3:
        round(
          usefulVolume,
          2
        ),

      inflow_24h_m3s:
        round(
          inflow24h,
          2
        ),

      turbine_24h_m3s:
        round(
          turbine24h,
          2
        ),

      net_depletion_m3s:
        round(
          netDepletion,
          2
        ),
    };
  }

  const days =
    (
      usefulVolume *
      1_000_000
    ) /
    (
      netDepletion *
      86_400
    );

  return {
    status:
      "Đang giảm về MN chết",

    code:
      "decreasing",

    days:
      round(
        days,
        1
      ),

    note:
      (
        `Giảm ròng ` +
        `${round(
          netDepletion,
          2
        )} m³/s`
      ),

    useful_volume_million_m3:
      round(
        usefulVolume,
        2
      ),

    inflow_24h_m3s:
      round(
        inflow24h,
        2
      ),

    turbine_24h_m3s:
      round(
        turbine24h,
        2
      ),

    net_depletion_m3s:
      round(
        netDepletion,
        2
      ),
  };
}

/* ======================================================
   HANDLER
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
    requireEnvironment();

    const auth =
      await verifySupabaseUser(
        getBearerToken(req)
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

    /*
     * GIỮ NGUYÊN CÁC NGUỒN DỮ LIỆU CŨ.
     */
    const [
      reservoirRowsRaw,
      storageRows,
      inflowForecastRowsRaw,
      rainfallForecastRowsRaw,
    ] =
      await Promise.all([
        supabaseSelect(
          "reservoir_hourly_data",
          {
            select:
              "*",

            order:
              "time.desc",

            limit:
              500,
          }
        ),

        supabaseSelect(
          "v_current_storage",
          {
            select:
              "*",

            limit:
              10,
          }
        ),

        supabaseSelect(
          "inflow_forecast",
          {
            select:
              "*",

            order:
              "forecast_time.asc",

            limit:
              500,
          }
        ),

        supabaseSelect(
          "rainfall_forecast",
          {
            select:
              "*",

            order:
              "forecast_time.asc",

            limit:
              500,
          }
        ).catch(() => []),
      ]);

    const reservoirRows =
      uniqueByTime(
        reservoirRowsRaw,
        "time"
      );

    const latest =
      reservoirRows.length
        ? reservoirRows[
            reservoirRows.length - 1
          ]
        : null;

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
      parseReservoirOperationalTime(
        latest.time
      );

    if (!latestTime) {
      throw new Error(
        `Thời gian hồ không hợp lệ: ${latest.time}`
      );
    }

    /*
     * Dữ liệu 24 giờ và 7 ngày,
     * giữ nguyên cách lọc theo dữ liệu mới nhất.
     */
    const rows24h =
      reservoirRows.filter(
        (row) => {
          const rowTime =
            parseReservoirOperationalTime(
              row.time
            );

          return (
            rowTime &&
            rowTime.getTime() >=
              latestTime.getTime() -
              24 *
              60 *
              60 *
              1000
          );
        }
      );

    const rows7d =
      reservoirRows.filter(
        (row) => {
          const rowTime =
            parseReservoirOperationalTime(
              row.time
            );

          return (
            rowTime &&
            rowTime.getTime() >=
              latestTime.getTime() -
              7 *
              24 *
              60 *
              60 *
              1000
          );
        }
      );

    const oldest24h =
      rows24h.length
        ? rows24h[0]
        : latest;

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
        latest.turbine_flow,
        0
      );

    const spillwayFlow =
      toNumber(
        latest.spillway_flow,
        0
      );

    const delta24h =
      Number.isFinite(
        waterLevel
      ) &&
      Number.isFinite(
        toNumber(
          oldest24h?.water_level
        )
      )
        ? (
            waterLevel -
            toNumber(
              oldest24h.water_level
            )
          )
        : null;

    /*
     * GIỮ NGUYÊN DUNG TÍCH THẬT
     * TỪ v_current_storage.
     */
    const currentStorageRow =
      Array.isArray(storageRows) &&
      storageRows.length
        ? storageRows[0]
        : null;

    const currentStorage =
      getStorageValue(
        currentStorageRow
      );

    const storageSummary =
      calculateStorageSummary(
        currentStorage
      );

    const safetySummary =
      calculateSafetySummary(
        waterLevel
      );

    /*
     * Mưa vận hành cũ.
     */
    const currentDay =
      getReservoirLiteralDateKey(
        latest.time
      );

    const previousDayDate =
      new Date(
        latestTime.getTime() -
        24 *
        60 *
        60 *
        1000
      );

    const previousDay =
      getLocalDateKey(
        previousDayDate
      );

    const rainDay =
      sum(
        reservoirRows
          .filter(
            (row) =>
              getReservoirLiteralDateKey(
                row.time
              ) === currentDay
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
              getReservoirLiteralDateKey(
                row.time
              ) === previousDay
          )
          .map(
            getRainValue
          )
      );

    const rain1h =
      getRainValue(
        latest
      );

    /*
     * Trung bình cũ.
     */
    const averageInflow24h =
      average(
        rows24h.map(
          (row) =>
            row.inflow
        )
      );

    const averageTurbine24h =
      average(
        rows24h.map(
          (row) =>
            row.turbine_flow
        )
      );

    const averageSpillway24h =
      average(
        rows24h.map(
          (row) =>
            row.spillway_flow
        )
      );

    const averageInflow7d =
      average(
        rows7d.map(
          (row) =>
            row.inflow
        )
      );

    /*
     * BỔ SUNG: dữ liệu từ đầu tháng
     * chỉ để tính tần suất thủy văn.
     */
    const latestMonthInfo =
      getReservoirMonthKey(
        latest.time
      );

    const latestMonthRowsRaw =
      latestMonthInfo
        ? await supabaseSelect(
            "reservoir_hourly_data",
            {
              select:
                "time,inflow",

              time:
                `gte.${latestMonthInfo.startIso}`,

              order:
                "time.asc",

              limit:
                2000,
            }
          )
        : [];

    const latestMonthRows =
      uniqueByTime(
        latestMonthRowsRaw,
        "time"
      ).filter(
        (row) =>
          getReservoirMonthKey(
            row.time
          )?.key ===
          latestMonthInfo?.key
      );

    const hydrologyFrequency =
      await calculateHydrologyFrequency({
        latestTime:
          latest.time,

        latestMonthRows,
      });

    /*
     * BỔ SUNG: dự báo chạm MN chết.
     *
     * Dùng dung tích hữu ích hiện có,
     * không dùng dung tích trống.
     */
    const usefulVolumeCurrent =
      (
        Number.isFinite(
          currentStorage
        )
          ? Math.max(
              0,
              currentStorage -
              RESERVOIR
                .VOL_DEAD_MILLION_M3
            )
          : null
      );

    const deadLevelForecast =
      calculateDeadLevelForecast({
        usefulRemainingMillionM3:
          usefulVolumeCurrent,

        averageInflow24h:
          averageInflow24h,

        averageTurbine24h:
          averageTurbine24h,
      });

    const currentOutflow =
      toNumber(
        turbineFlow,
        0
      ) +
      toNumber(
        spillwayFlow,
        0
      );

    const inflowForecastRows =
      Array.isArray(
        inflowForecastRowsRaw
      )
        ? inflowForecastRowsRaw
        : [];

    const rainfallForecastRows =
      Array.isArray(
        rainfallForecastRowsRaw
      )
        ? rainfallForecastRowsRaw
        : [];

    const forecastSummary =
      calculateForecastSummary({
        currentWaterLevel:
          waterLevel,

        forecastRows:
          inflowForecastRows,
      });

    const freshness =
      getDataFreshness(
        latest.time
      );

    return sendJson(
      res,
      200,
      {
        ok:
          true,

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

          time_mode:
            "reservoir_local_literal",

          time_zone:
            VN_TIME_ZONE,

          freshness,
        },

        safety:
          safetySummary,

        current: {
          time:
            latest.time,

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

          total_outflow_m3s:
            round(
              currentOutflow,
              2
            ),
        },

        averages: {
          inflow_24h_m3s:
            round(
              averageInflow24h,
              2
            ),

          turbine_24h_m3s:
            round(
              averageTurbine24h,
              2
            ),

          spillway_24h_m3s:
            round(
              averageSpillway24h,
              2
            ),

          inflow_7d_m3s:
            round(
              averageInflow7d,
              2
            ),

          inflow_month_to_date_m3s:
            hydrologyFrequency
              .average_inflow_m3s,

          water_level_delta_24h_m:
            round(
              delta24h,
              2
            ),
        },

        rainfall: {
          rain_1h_mm:
            round(
              rain1h,
              1
            ),

          rain_day_mm:
            round(
              rainDay,
              1
            ),

          rain_previous_day_mm:
            round(
              rainD1,
              1
            ),
        },

        /*
         * GIỮ NGUYÊN STORAGE TỪ
         * v_current_storage.
         */
        reservoir: {
          ...storageSummary,

          storage_source:
            Number.isFinite(
              currentStorage
            )
              ? "v_current_storage"
              : null,
        },

        forecast: {
          inflow:
            forecastSummary,

          rainfall: {
            available:
              rainfallForecastRows.length >
              0,

            rows:
              rainfallForecastRows,
          },

          /*
           * Hai phần mới.
           */
          hydrology_frequency:
            hydrologyFrequency,

          dead_level:
            deadLevelForecast,
        },

        coverage: {
          reservoir_rows_24h:
            rows24h.length,

          reservoir_rows_7d:
            rows7d.length,

          reservoir_rows_month_to_date:
            latestMonthRows.length,

          inflow_forecast_rows:
            inflowForecastRows.length,

          rainfall_forecast_rows:
            rainfallForecastRows.length,

          storage_rows:
            Array.isArray(
              storageRows
            )
              ? storageRows.length
              : 0,
        },
      },

      "private, max-age=0, s-maxage=60, stale-while-revalidate=180"
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
        ok:
          false,

        mode:
          "mobile-overview",

        error:
          error?.message ||
          "Lỗi máy chủ không xác định",
      }
    );
  }
}
