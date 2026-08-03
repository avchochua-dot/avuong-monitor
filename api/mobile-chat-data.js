const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

/*
 * Thông số hồ A Vương.
 */
const RESERVOIR_CONSTANTS = {
  DEAD_VOLUME_MILLION_M3: 77.07,
  NORMAL_VOLUME_MILLION_M3: 343.55,
  DEAD_WATER_LEVEL_M: 340,
  NORMAL_WATER_LEVEL_M: 380,
};

/* ======================================================
   RESPONSE HELPERS
====================================================== */

function json(
  res,
  status,
  data,
  cache = "no-store"
) {
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
    cache
  );

  return res
    .status(status)
    .json(data);
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function round(
  value,
  digits = 2
) {
  const number =
    nullableNumber(value);

  if (number === null) {
    return null;
  }

  const factor =
    Math.pow(10, digits);

  return (
    Math.round(
      number * factor
    ) / factor
  );
}

function average(
  rows,
  field
) {
  const values =
    (rows || [])
      .map((row) =>
        nullableNumber(
          row?.[field]
        )
      )
      .filter(
        (value) =>
          value !== null
      );

  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / values.length
  );
}

function minValue(
  rows,
  field
) {
  const values =
    (rows || [])
      .map((row) =>
        nullableNumber(
          row?.[field]
        )
      )
      .filter(
        (value) =>
          value !== null
      );

  return values.length
    ? Math.min(...values)
    : null;
}

function maxValue(
  rows,
  field
) {
  const values =
    (rows || [])
      .map((row) =>
        nullableNumber(
          row?.[field]
        )
      )
      .filter(
        (value) =>
          value !== null
      );

  return values.length
    ? Math.max(...values)
    : null;
}

function sumValue(
  rows,
  field
) {
  return (rows || []).reduce(
    (sum, row) => {
      const value =
        nullableNumber(
          row?.[field]
        );

      return (
        sum +
        (
          value === null
            ? 0
            : value
        )
      );
    },
    0
  );
}

/* ======================================================
   AUTHENTICATION
====================================================== */

function getBearerToken(req) {
  const authorization =
    String(
      req?.headers?.authorization ||
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

  if (!SUPABASE_URL) {
    return {
      ok: false,
      status: 500,
      error:
        "Thiếu SUPABASE_URL",
    };
  }

  if (
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      ok: false,
      status: 500,
      error:
        "Thiếu SUPABASE_SERVICE_ROLE_KEY",
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

          Accept:
            "application/json",
        },

        cache:
          "no-store",
      }
    );

  if (!response.ok) {
    return {
      ok: false,
      status: 401,
      error:
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
    };
  }

  let user = null;

  try {
    user =
      await response.json();
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
    status: 200,
    user,
  };
}

/* ======================================================
   SUPABASE REST HELPERS
====================================================== */

function ensureEnvironment() {
  if (!SUPABASE_URL) {
    throw new Error(
      "Missing SUPABASE_URL"
    );
  }

  if (
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY"
    );
  }
}

/*
 * params nhận dạng mảng để có thể gửi nhiều điều kiện
 * trên cùng một cột, ví dụ:
 *
 * [
 *   ["time", "gt.2026-08-02T07:00:00Z"],
 *   ["time", "lte.2026-08-03T07:00:00Z"]
 * ]
 */
async function supabaseSelect(
  table,
  params = []
) {
  ensureEnvironment();

  const query =
    new URLSearchParams();

  for (
    const [key, value]
    of params
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    query.append(
      key,
      String(value)
    );
  }

  const queryString =
    query.toString();

  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    (
      queryString
        ? `?${queryString}`
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

          "Content-Type":
            "application/json",
        },

        cache:
          "no-store",
      }
    );

  const body =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase SELECT ${table} ` +
      `${response.status}: ${body}`
    );
  }

  if (!body) {
    return [];
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Supabase trả JSON không hợp lệ: ` +
      `${body.slice(0, 300)}`
    );
  }
}

/* ======================================================
   TIME HELPERS
====================================================== */

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      String(value)
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function subtractHours(
  date,
  hours
) {
  return new Date(
    date.getTime() -
    hours *
    60 *
    60 *
    1000
  );
}

function getAgeMinutes(value) {
  const date =
    parseDate(value);

  if (!date) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(
      (
        Date.now() -
        date.getTime()
      ) / 60000
    )
  );
}

/*
 * Dữ liệu reservoir_hourly_data có thể đang lưu
 * giờ vận hành trong chính chuỗi thời gian.
 *
 * Lấy tháng trực tiếp từ YYYY-MM-DD để tránh
 * cộng hoặc trừ múi giờ thêm lần nữa.
 */
function getOperationalMonth(value) {
  const text =
    String(value || "");

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (!match) {
    return null;
  }

  const month =
    Number(match[2]);

  return (
    month >= 1 &&
    month <= 12
  )
    ? month
    : null;
}

function getOperationalMonthStart(
  value
) {
  const text =
    String(value || "");

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (!match) {
    return null;
  }

  return (
    `${match[1]}-${match[2]}` +
    `-01T00:00:00`
  );
}

/* ======================================================
   DATA NORMALIZATION
====================================================== */

function uniqueRowsByTime(
  rows,
  timeField = "time"
) {
  const map =
    new Map();

  const sorted =
    [...(rows || [])]
      .sort(
        (a, b) => {
          const timeDiff =
            new Date(
              b?.[timeField] || 0
            ).getTime() -
            new Date(
              a?.[timeField] || 0
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
        }
      );

  for (const row of sorted) {
    const key =
      row?.[timeField];

    if (
      key &&
      !map.has(key)
    ) {
      map.set(
        key,
        row
      );
    }
  }

  return Array
    .from(
      map.values()
    )
    .sort(
      (a, b) =>
        new Date(
          a?.[timeField] || 0
        ).getTime() -
        new Date(
          b?.[timeField] || 0
        ).getTime()
    );
}

/* ======================================================
   HYDROLOGY FREQUENCY
====================================================== */

function classifyHydrologyFrequency(
  percent
) {
  const value =
    nullableNumber(percent);

  if (value === null) {
    return {
      group:
        "Chưa có dữ liệu",

      note:
        "Chưa xác định được tần suất thủy văn",
    };
  }

  if (value <= 10) {
    return {
      group:
        "Rất nhiều nước",

      note:
        "Thuộc nhóm năm rất nhiều nước",
    };
  }

  if (value <= 25) {
    return {
      group:
        "Nhiều nước",

      note:
        "Thuộc nhóm năm nhiều nước",
    };
  }

  if (value <= 50) {
    return {
      group:
        "Nhóm trung bình",

      note:
        "Thuộc nhóm thủy văn trung bình",
    };
  }

  if (value <= 75) {
    return {
      group:
        "Ít nước",

      note:
        "Thuộc nhóm năm ít nước",
    };
  }

  return {
    group:
      "Rất ít nước",

    note:
      "Thuộc nhóm năm rất ít nước",
  };
}

function interpolateHydrologyFrequency(
  averageInflow,
  frequencyRows
) {
  const inflow =
    nullableNumber(
      averageInflow
    );

  if (
    inflow === null ||
    !Array.isArray(
      frequencyRows
    ) ||
    !frequencyRows.length
  ) {
    return {
      percent: null,
      lower_reference: null,
      upper_reference: null,
    };
  }

  const points =
    frequencyRows
      .map((row) => ({
        inflow_value:
          nullableNumber(
            row.inflow_value
          ),

        frequency_percent:
          nullableNumber(
            row.frequency_percent
          ),
      }))
      .filter(
        (row) =>
          row.inflow_value !== null &&
          row.frequency_percent !== null
      )
      .sort(
        (a, b) =>
          a.inflow_value -
          b.inflow_value
      );

  if (!points.length) {
    return {
      percent: null,
      lower_reference: null,
      upper_reference: null,
    };
  }

  if (
    inflow <=
    points[0].inflow_value
  ) {
    return {
      percent:
        points[0]
          .frequency_percent,

      lower_reference:
        points[0],

      upper_reference:
        points[0],
    };
  }

  const lastPoint =
    points[
      points.length - 1
    ];

  if (
    inflow >=
    lastPoint.inflow_value
  ) {
    return {
      percent:
        lastPoint
          .frequency_percent,

      lower_reference:
        lastPoint,

      upper_reference:
        lastPoint,
    };
  }

  for (
    let index = 0;
    index < points.length - 1;
    index += 1
  ) {
    const lower =
      points[index];

    const upper =
      points[index + 1];

    if (
      inflow >=
        lower.inflow_value &&
      inflow <=
        upper.inflow_value
    ) {
      const distance =
        upper.inflow_value -
        lower.inflow_value;

      if (distance === 0) {
        return {
          percent:
            lower.frequency_percent,

          lower_reference:
            lower,

          upper_reference:
            upper,
        };
      }

      const ratio =
        (
          inflow -
          lower.inflow_value
        ) / distance;

      const percent =
        lower.frequency_percent +
        ratio *
        (
          upper.frequency_percent -
          lower.frequency_percent
        );

      return {
        percent:
          round(percent, 1),

        lower_reference:
          lower,

        upper_reference:
          upper,
      };
    }
  }

  return {
    percent: null,
    lower_reference: null,
    upper_reference: null,
  };
}

/* ======================================================
   DEAD LEVEL FORECAST
====================================================== */

function calculateDeadLevelForecast({
  currentVolume,
  averageInflow24h,
  averageTurbine24h,
}) {
  const volume =
    nullableNumber(
      currentVolume
    );

  const inflow =
    nullableNumber(
      averageInflow24h
    );

  const turbine =
    nullableNumber(
      averageTurbine24h
    );

  if (
    volume === null ||
    inflow === null ||
    turbine === null
  ) {
    return {
      code:
        "missing_data",

      status:
        "Chưa có dữ liệu",

      days:
        null,

      note:
        "Chưa đủ dữ liệu để dự báo chạm mực nước chết",

      useful_volume_million_m3:
        null,

      inflow_24h_m3s:
        round(inflow, 2),

      turbine_24h_m3s:
        round(turbine, 2),
    };
  }

  const usefulVolume =
    Math.max(
      0,
      volume -
      RESERVOIR_CONSTANTS
        .DEAD_VOLUME_MILLION_M3
    );

  if (usefulVolume <= 0) {
    return {
      code:
        "reached_dead_level",

      status:
        "Đã chạm MN chết",

      days:
        0,

      note:
        "Dung tích hữu ích hiện bằng 0",

      useful_volume_million_m3:
        0,

      inflow_24h_m3s:
        round(inflow, 2),

      turbine_24h_m3s:
        round(turbine, 2),
    };
  }

  /*
   * Theo yêu cầu hiện tại:
   * chỉ so sánh Q máy và Q về,
   * chưa cộng Q xả tràn.
   */
  const netDecrease =
    turbine -
    inflow;

  if (
    Math.abs(
      netDecrease
    ) < 0.05
  ) {
    return {
      code:
        "stable",

      status:
        "Ổn định",

      days:
        null,

      note:
        "Q về xấp xỉ Q chạy máy nên chưa xác định thời gian chạm MN chết",

      useful_volume_million_m3:
        round(
          usefulVolume,
          2
        ),

      inflow_24h_m3s:
        round(inflow, 2),

      turbine_24h_m3s:
        round(turbine, 2),
    };
  }

  if (netDecrease < 0) {
    return {
      code:
        "rising",

      status:
        "Đang tăng",

      days:
        null,

      note:
        "Q về lớn hơn Q chạy máy nên dung tích hồ đang có xu hướng tăng",

      useful_volume_million_m3:
        round(
          usefulVolume,
          2
        ),

      inflow_24h_m3s:
        round(inflow, 2),

      turbine_24h_m3s:
        round(turbine, 2),
    };
  }

  /*
   * Triệu m³ -> m³:
   * usefulVolume * 1.000.000
   *
   * m³/s -> m³/ngày:
   * netDecrease * 86.400
   */
  const days =
    (
      usefulVolume *
      1000000
    ) /
    (
      netDecrease *
      86400
    );

  return {
    code:
      "decreasing",

    status:
      "Đang giảm",

    days:
      round(days, 1),

    note:
      "Ước tính theo dung tích hữu ích hiện tại và chênh lệch Q máy - Q về trung bình 24 giờ",

    useful_volume_million_m3:
      round(
        usefulVolume,
        2
      ),

    net_decrease_m3s:
      round(
        netDecrease,
        2
      ),

    inflow_24h_m3s:
      round(inflow, 2),

    turbine_24h_m3s:
      round(turbine, 2),
  };
}

/* ======================================================
   DATA LOADERS
====================================================== */

async function loadLatestReservoirRow() {
  const rows =
    await supabaseSelect(
      "reservoir_hourly_data",
      [
        [
          "select",
          [
            "time",
            "water_level",
            "inflow",
            "turbine_flow",
            "spillway_flow",
            "rainfallreal",
            "created_at",
          ].join(","),
        ],

        [
          "order",
          "time.desc,created_at.desc",
        ],

        [
          "limit",
          "1",
        ],
      ]
    );

  return rows?.[0] || null;
}

async function loadReservoir24h(
  latestTime
) {
  const latestDate =
    parseDate(
      latestTime
    );

  if (!latestDate) {
    return [];
  }

  const startDate =
    subtractHours(
      latestDate,
      24
    );

  /*
   * Dùng gt ở mốc đầu và lte ở mốc cuối để
   * tránh lấy 25 điểm khi dữ liệu theo giờ.
   */
  const rows =
    await supabaseSelect(
      "reservoir_hourly_data",
      [
        [
          "select",
          [
            "time",
            "water_level",
            "inflow",
            "turbine_flow",
            "spillway_flow",
            "rainfallreal",
            "created_at",
          ].join(","),
        ],

        [
          "time",
          `gt.${startDate.toISOString()}`,
        ],

        [
          "time",
          `lte.${latestDate.toISOString()}`,
        ],

        [
          "order",
          "time.asc,created_at.desc",
        ],

        [
          "limit",
          "200",
        ],
      ]
    );

  return uniqueRowsByTime(
    rows,
    "time"
  );
}

async function loadCurrentMonthRows(
  latestTime
) {
  const monthStart =
    getOperationalMonthStart(
      latestTime
    );

  if (!monthStart) {
    return [];
  }

  const rows =
    await supabaseSelect(
      "reservoir_hourly_data",
      [
        [
          "select",
          "time,inflow,created_at",
        ],

        [
          "time",
          `gte.${monthStart}`,
        ],

        [
          "time",
          `lte.${latestTime}`,
        ],

        [
          "order",
          "time.asc,created_at.desc",
        ],

        [
          "limit",
          "2500",
        ],
      ]
    );

  return uniqueRowsByTime(
    rows,
    "time"
  );
}

async function loadCurrentStorage() {
  const rows =
    await supabaseSelect(
      "v_current_storage",
      [
        [
          "select",
          "*",
        ],

        [
          "order",
          "time.desc",
        ],

        [
          "limit",
          "1",
        ],
      ]
    );

  return rows?.[0] || null;
}

async function loadHydrologyFrequencyRows(
  month
) {
  if (!month) {
    return [];
  }

  return supabaseSelect(
    "monthly_inflow_frequency",
    [
      [
        "select",
        [
          "month",
          "frequency_percent",
          "inflow_value",
        ].join(","),
      ],

      [
        "month",
        `eq.${month}`,
      ],

      [
        "order",
        "inflow_value.asc",
      ],

      [
        "limit",
        "500",
      ],
    ]
  );
}

async function loadLatestDownstream() {
  const rows =
    await supabaseSelect(
      "downstream_manual_observations",
      [
        [
          "select",
          [
            "obs_hour",
            "obs_time",
            "hoi_khach_m",
            "ai_nghia_m",
            "source",
            "updated_at",
          ].join(","),
        ],

        [
          "order",
          "obs_hour.desc",
        ],

        [
          "limit",
          "1",
        ],
      ]
    );

  return rows?.[0] || null;
}

/* ======================================================
   BUILD RESPONSE
====================================================== */

function buildInflowTrend(
  rows
) {
  const validRows =
    (rows || [])
      .filter(
        (row) =>
          nullableNumber(
            row?.inflow
          ) !== null
      );

  if (!validRows.length) {
    return {
      first_m3s:
        null,

      latest_m3s:
        null,

      delta_m3s:
        null,

      average_m3s:
        null,

      min_m3s:
        null,

      max_m3s:
        null,

      direction:
        "unknown",

      count:
        0,
    };
  }

  const first =
    nullableNumber(
      validRows[0]?.inflow
    );

  const latest =
    nullableNumber(
      validRows[
        validRows.length - 1
      ]?.inflow
    );

  const delta =
    (
      first !== null &&
      latest !== null
    )
      ? latest - first
      : null;

  let direction =
    "unknown";

  if (delta !== null) {
    if (
      Math.abs(delta) <
      0.05
    ) {
      direction =
        "stable";
    } else if (delta > 0) {
      direction =
        "increasing";
    } else {
      direction =
        "decreasing";
    }
  }

  return {
    first_m3s:
      round(first, 2),

    latest_m3s:
      round(latest, 2),

    delta_m3s:
      round(delta, 2),

    average_m3s:
      round(
        average(
          validRows,
          "inflow"
        ),
        2
      ),

    min_m3s:
      round(
        minValue(
          validRows,
          "inflow"
        ),
        2
      ),

    max_m3s:
      round(
        maxValue(
          validRows,
          "inflow"
        ),
        2
      ),

    direction,

    count:
      validRows.length,
  };
}

function buildFreshness(
  sourceTime,
  staleAfterMinutes = 90
) {
  const ageMinutes =
    getAgeMinutes(
      sourceTime
    );

  if (ageMinutes === null) {
    return {
      source_time:
        sourceTime || null,

      age_minutes:
        null,

      is_stale:
        true,

      status:
        "unknown",

      message:
        "Không xác định được độ mới của dữ liệu",
    };
  }

  const isStale =
    ageMinutes >
    staleAfterMinutes;

  return {
    source_time:
      sourceTime,

    age_minutes:
      ageMinutes,

    is_stale:
      isStale,

    status:
      isStale
        ? "stale"
        : "fresh",

    message:
      isStale
        ? `Dữ liệu đã cũ ${ageMinutes} phút`
        : `Dữ liệu cập nhật cách đây ${ageMinutes} phút`,
  };
}

/* ======================================================
   API ENTRY
====================================================== */

export default async function handler(
  req,
  res
) {
  try {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return json(
        res,
        200,
        {
          ok: true,
        }
      );
    }

    if (
      req.method !==
      "GET"
    ) {
      return json(
        res,
        405,
        {
          ok: false,

          error:
            "API chỉ hỗ trợ GET",
        }
      );
    }

    /*
     * Chỉ dùng để kiểm tra có biến môi trường hay chưa.
     * Không trả giá trị secret.
     */
    if (
      req.query?.debug ===
      "env"
    ) {
      return json(
        res,
        200,
        {
          ok: true,

          has_SUPABASE_URL:
            Boolean(
              SUPABASE_URL
            ),

          has_SUPABASE_SERVICE_ROLE_KEY:
            Boolean(
              SUPABASE_SERVICE_ROLE_KEY
            ),
        }
      );
    }

    const auth =
      await verifySupabaseUser(
        getBearerToken(req)
      );

    if (!auth.ok) {
      return json(
        res,
        auth.status || 401,
        {
          ok: false,

          error:
            auth.error ||
            "Không có quyền truy cập",
        }
      );
    }

    /*
     * Bước 1:
     * lấy bản ghi hồ mới nhất trước.
     */
    const latestReservoir =
      await loadLatestReservoirRow();

    if (!latestReservoir?.time) {
      return json(
        res,
        404,
        {
          ok: false,

          error:
            "Chưa có dữ liệu hồ trong reservoir_hourly_data",
        }
      );
    }

    const latestTime =
      latestReservoir.time;

    const month =
      getOperationalMonth(
        latestTime
      );

    /*
     * Bước 2:
     * tải song song các nhóm dữ liệu còn lại.
     */
    const [
      reservoir24h,
      currentMonthRows,
      storageRow,
      hydrologyRows,
      downstreamRow,
    ] =
      await Promise.all([
        loadReservoir24h(
          latestTime
        ),

        loadCurrentMonthRows(
          latestTime
        ),

        loadCurrentStorage(),

        loadHydrologyFrequencyRows(
          month
        ),

        loadLatestDownstream(),
      ]);

    /*
     * Bảo đảm bản ghi mới nhất luôn có trong tập 24h.
     */
    let rows24h =
      uniqueRowsByTime(
        [
          ...(reservoir24h || []),
          latestReservoir,
        ],
        "time"
      );

    /*
     * Mưa 24 giờ trượt:
     * latest - 24h < time <= latest.
     */
    const rain24h =
      sumValue(
        rows24h,
        "rainfallreal"
      );

    const rain1h =
      nullableNumber(
        latestReservoir
          .rainfallreal
      );

    const inflowTrend =
      buildInflowTrend(
        rows24h
      );

    const averageInflow24h =
      average(
        rows24h,
        "inflow"
      );

    const averageTurbine24h =
      average(
        rows24h,
        "turbine_flow"
      );

    const averageSpillway24h =
      average(
        rows24h,
        "spillway_flow"
      );

    const averageInflowMonth =
      average(
        currentMonthRows,
        "inflow"
      );

    const hydrologyResult =
      interpolateHydrologyFrequency(
        averageInflowMonth,
        hydrologyRows
      );

    const hydrologyClass =
      classifyHydrologyFrequency(
        hydrologyResult.percent
      );

    const currentVolume =
      nullableNumber(
        storageRow?.volume ??
        storageRow?.current_volume
      );

    const usefulVolume =
      currentVolume === null
        ? null
        : Math.max(
            0,
            currentVolume -
            RESERVOIR_CONSTANTS
              .DEAD_VOLUME_MILLION_M3
          );

    const totalPercent =
      currentVolume === null
        ? null
        : (
            currentVolume /
            RESERVOIR_CONSTANTS
              .NORMAL_VOLUME_MILLION_M3
          ) * 100;

    const usefulCapacity =
      (
        RESERVOIR_CONSTANTS
          .NORMAL_VOLUME_MILLION_M3 -
        RESERVOIR_CONSTANTS
          .DEAD_VOLUME_MILLION_M3
      );

    const usefulPercent =
      usefulVolume === null
        ? null
        : (
            usefulVolume /
            usefulCapacity
          ) * 100;

    const deadLevelForecast =
      calculateDeadLevelForecast({
        currentVolume,

        averageInflow24h,

        averageTurbine24h,
      });

    const reservoirFreshness =
      buildFreshness(
        latestTime,
        90
      );

    const downstreamTime =
      downstreamRow?.obs_hour ||
      downstreamRow?.obs_time ||
      null;

    const downstreamFreshness =
      buildFreshness(
        downstreamTime,
        120
      );

    return json(
      res,
      200,
      {
        ok: true,

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

        reservoir: {
          time:
            latestTime,

          water_level_m:
            round(
              latestReservoir
                .water_level,
              2
            ),

          inflow_m3s:
            round(
              latestReservoir
                .inflow,
              2
            ),

          turbine_flow_m3s:
            round(
              latestReservoir
                .turbine_flow,
              2
            ),

          spillway_flow_m3s:
            round(
              latestReservoir
                .spillway_flow,
              2
            ),

          freshness:
            reservoirFreshness,
        },

        trend_24h: {
          ...inflowTrend,

          period_start:
            rows24h?.[0]?.time ||
            null,

          period_end:
            rows24h?.[
              rows24h.length - 1
            ]?.time ||
            latestTime,

          turbine_average_m3s:
            round(
              averageTurbine24h,
              2
            ),

          spillway_average_m3s:
            round(
              averageSpillway24h,
              2
            ),
        },

        rain: {
          rain_1h_mm:
            round(
              rain1h,
              1
            ),

          rain_24h_mm:
            round(
              rain24h,
              1
            ),

          period_start:
            rows24h?.[0]?.time ||
            null,

          period_end:
            rows24h?.[
              rows24h.length - 1
            ]?.time ||
            latestTime,

          sample_count:
            rows24h.length,
        },

        storage: {
          time:
            storageRow?.time ||
            null,

          volume_million_m3:
            round(
              currentVolume,
              2
            ),

          useful_volume_million_m3:
            round(
              usefulVolume,
              2
            ),

          total_percent:
            round(
              totalPercent,
              1
            ),

          useful_percent:
            round(
              usefulPercent,
              1
            ),

          dead_volume_million_m3:
            RESERVOIR_CONSTANTS
              .DEAD_VOLUME_MILLION_M3,

          normal_volume_million_m3:
            RESERVOIR_CONSTANTS
              .NORMAL_VOLUME_MILLION_M3,
        },

        hydrology: {
          month,

          average_inflow_month_m3s:
            round(
              averageInflowMonth,
              2
            ),

          frequency_percent:
            round(
              hydrologyResult.percent,
              1
            ),

          group:
            hydrologyClass.group,

          note:
            hydrologyClass.note,

          lower_reference:
            hydrologyResult
              .lower_reference,

          upper_reference:
            hydrologyResult
              .upper_reference,
        },

        dead_level: {
          ...deadLevelForecast,
        },

        downstream: {
          time:
            downstreamTime,

          hoi_khach_m:
            round(
              downstreamRow
                ?.hoi_khach_m,
              2
            ),

          ai_nghia_m:
            round(
              downstreamRow
                ?.ai_nghia_m,
              2
            ),

          source:
            downstreamRow
              ?.source ||
            null,

          freshness:
            downstreamFreshness,
        },

        coverage: {
          reservoir_24h_count:
            rows24h.length,

          current_month_count:
            currentMonthRows.length,

          hydrology_reference_count:
            hydrologyRows.length,

          has_storage:
            Boolean(
              storageRow
            ),

          has_downstream:
            Boolean(
              downstreamRow
            ),
        },
      },
      "private, no-store"
    );
  } catch (error) {
    console.error(
      "mobile-chat-data error:",
      error
    );

    return json(
      res,
      500,
      {
        ok: false,

        error:
          error?.message ||
          "Lỗi máy chủ không xác định",

        hint:
          "Kiểm tra schema reservoir_hourly_data, v_current_storage, monthly_inflow_frequency và downstream_manual_observations",
      }
    );
  }
}
