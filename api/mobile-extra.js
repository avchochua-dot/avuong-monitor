/**
 * api/mobile-extra.js
 * FIX 2026-09-15:
 * normalize hydrology frequency ratio 0..1 -> percent 0..100
 *
 * API chỉ phục vụ:
 * 1. Tần suất thủy văn của Q về trung bình tháng.
 * 2. Dự báo số ngày chạm mực nước chết.
 *
 * Không thay đổi dữ liệu Tổng quan của PWA V12.
 *
 * Environment Variables trên Vercel:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEAD_VOLUME_MILLION_M3 =
  77.07;


/* ================================================================
   RESPONSE
   ================================================================ */

function sendJson(
  res,
  status,
  payload
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
    "private, max-age=0, s-maxage=60, stale-while-revalidate=180"
  );

  return res
    .status(status)
    .json(payload);
}


/* ================================================================
   BASIC UTILITIES
   ================================================================ */

function toNumber(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
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
      .map(
        (value) =>
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


function uniqueByTime(
  rows = []
) {
  const map =
    new Map();

  for (const row of rows) {
    if (!row?.time) {
      continue;
    }

    if (!map.has(row.time)) {
      map.set(
        row.time,
        row
      );
    }
  }

  return [
    ...map.values(),
  ];
}


/* ================================================================
   AUTH
   ================================================================ */

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


async function verifyUser(
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
        method:
          "GET",

        headers: {
          apikey:
            SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${accessToken}`,
        },
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

  return {
    ok: true,
  };
}


/* ================================================================
   SUPABASE
   ================================================================ */

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
        method:
          "GET",

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
      text.slice(0, 600)
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Dữ liệu từ ${table} không hợp lệ`
    );
  }
}


/* ================================================================
   TIME
   ================================================================ */

function getMonthInfo(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

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

    start:
      `${match[1]}-${match[2]}-01T00:00:00`,
  };
}


/* ================================================================
   STORAGE
   ================================================================ */

function getStorageValue(
  row
) {
  const candidates = [
    row?.volume,
    row?.current_volume,
    row?.storage_million_m3,
    row?.volume_million_m3,
    row?.storage,
    row?.v,
  ];

  for (
    const candidate
    of candidates
  ) {
    const value =
      toNumber(candidate);

    if (
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return null;
}


/* ================================================================
   HYDROLOGY FREQUENCY
   ================================================================ */

/*
 * Ghi chú theo tần suất:
 *
 * P nhỏ → nước nhiều.
 * P lớn → nước ít.
 *
 * Hàm này luôn nhận giá trị theo đơn vị %:
 *
 * 10  = 10%
 * 20  = 20%
 * 50  = 50%
 */
function classifyFrequency(
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


/*
 * Nội suy giữa hai mốc trong bảng:
 *
 * public.monthly_inflow_frequency
 *
 * FIX QUAN TRỌNG:
 *
 * Có hai kiểu dữ liệu có thể tồn tại:
 *
 * 1. Ratio:
 *
 *      0.1 = 10%
 *      0.2 = 20%
 *      0.5 = 50%
 *
 * 2. Percentage:
 *
 *      10 = 10%
 *      20 = 20%
 *      50 = 50%
 *
 * API sẽ tự nhận biết toàn bộ bảng tháng đang dùng kiểu nào.
 *
 * Sau hàm này:
 *
 *      percent LUÔN ở thang 0..100
 */
function interpolateFrequency(
  frequencyRows,
  inflow
) {
  const parsed =
    (frequencyRows || [])
      .map(
        (row) => ({
          inflow:
            toNumber(
              row.inflow_value
            ),

          percentRaw:
            toNumber(
              row.frequency_percent
            ),
        })
      )
      .filter(
        (row) =>
          Number.isFinite(
            row.inflow
          ) &&
          Number.isFinite(
            row.percentRaw
          )
      );


  /*
   * Xác định scale của bảng.
   *
   * Nếu tất cả giá trị <= 1:
   *
   *     0.2 = 20%
   *
   * Nếu có giá trị > 1:
   *
   *     20 = 20%
   */
  const maxRawPercent =
    parsed.length
      ? Math.max(
          ...parsed.map(
            (row) =>
              Math.abs(
                row.percentRaw
              )
          )
        )
      : null;


  const sourceScale =
    parsed.length &&
    maxRawPercent <= 1
      ? "ratio_0_1"
      : "percent_0_100";


  const multiplier =
    sourceScale === "ratio_0_1"
      ? 100
      : 1;


  /*
   * Chuẩn hóa tất cả về % 0..100.
   */
  const points =
    parsed
      .map(
        (row) => ({
          inflow:
            row.inflow,

          percent:
            row.percentRaw *
            multiplier,

          raw_percent:
            row.percentRaw,
        })
      )
      .sort(
        (a, b) =>
          a.inflow -
          b.inflow
      );


  if (!points.length) {
    return {
      percent:
        null,

      lower:
        null,

      upper:
        null,

      source_scale:
        sourceScale,
    };
  }


  if (points.length === 1) {
    return {
      percent:
        points[0].percent,

      lower:
        points[0],

      upper:
        points[0],

      source_scale:
        sourceScale,
    };
  }


  /*
   * Ngoài khoảng thấp nhất.
   */
  if (
    inflow <=
    points[0].inflow
  ) {
    return {
      percent:
        points[0].percent,

      lower:
        points[0],

      upper:
        points[0],

      source_scale:
        sourceScale,
    };
  }


  const last =
    points[
      points.length - 1
    ];


  /*
   * Ngoài khoảng cao nhất.
   */
  if (
    inflow >=
    last.inflow
  ) {
    return {
      percent:
        last.percent,

      lower:
        last,

      upper:
        last,

      source_scale:
        sourceScale,
    };
  }


  /*
   * Nội suy tuyến tính.
   */
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
      inflow >= lower.inflow &&
      inflow <= upper.inflow
    ) {
      const width =
        upper.inflow -
        lower.inflow;

      if (width === 0) {
        return {
          percent:
            lower.percent,

          lower,

          upper,

          source_scale:
            sourceScale,
        };
      }


      const ratio =
        (
          inflow -
          lower.inflow
        ) /
        width;


      const percent =
        lower.percent +
        ratio *
        (
          upper.percent -
          lower.percent
        );


      return {
        percent,

        lower,

        upper,

        source_scale:
          sourceScale,
      };
    }
  }


  return {
    percent:
      null,

    lower:
      null,

    upper:
      null,

    source_scale:
      sourceScale,
  };
}


/* ================================================================
   DEAD LEVEL FORECAST
   ================================================================ */

function calculateDeadLevelForecast({
  usefulVolumeMillionM3,
  inflow24h,
  turbine24h,
}) {
  const usefulVolume =
    toNumber(
      usefulVolumeMillionM3
    );

  const qIn =
    toNumber(
      inflow24h
    );

  const qMachine =
    toNumber(
      turbine24h
    );


  if (
    !Number.isFinite(
      usefulVolume
    ) ||
    !Number.isFinite(
      qIn
    ) ||
    !Number.isFinite(
      qMachine
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
    };
  }


  const netDecrease =
    qMachine - qIn;


  if (
    Math.abs(
      netDecrease
    ) < 0.05
  ) {
    return {
      status:
        "Ổn định",

      code:
        "stable",

      days:
        null,

      note:
        "Q về xấp xỉ Q chạy máy",
    };
  }


  if (netDecrease < 0) {
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
            Math.abs(netDecrease),
            2
          )} m³/s`
        ),
    };
  }


  const days =
    (
      usefulVolume *
      1_000_000
    ) /
    (
      netDecrease *
      86_400
    );


  return {
    status:
      "Đang giảm",

    code:
      "decreasing",

    days:
      round(
        days,
        1
      ),

    note:
      (
        `Q chạy máy lớn hơn Q về ` +
        `${round(
          netDecrease,
          2
        )} m³/s`
      ),
  };
}


/* ================================================================
   MAIN HANDLER
   ================================================================ */

export default async function handler(
  req,
  res
) {
  /*
   * CORS preflight.
   */
  if (
    req.method === "OPTIONS"
  ) {
    return sendJson(
      res,
      200,
      {
        ok:
          true,
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
        ok:
          false,

        error:
          "Method not allowed",
      }
    );
  }


  try {
    requireEnvironment();


    /* ============================================================
       AUTH
       ============================================================ */

    const auth =
      await verifyUser(
        getBearerToken(req)
      );


    if (!auth.ok) {
      return sendJson(
        res,
        auth.status,
        {
          ok:
            false,

          error:
            auth.error,
        }
      );
    }


    /* ============================================================
       LATEST OPERATIONAL DATA
       ============================================================ */

    const latestRows =
      await supabaseSelect(
        "reservoir_hourly_data",
        {
          select:
            "time,inflow,turbine_flow",

          order:
            "time.desc",

          limit:
            1,
        }
      );


    const latest =
      latestRows?.[0];


    if (!latest?.time) {
      return sendJson(
        res,
        404,
        {
          ok:
            false,

          error:
            "Không có dữ liệu vận hành hồ",
        }
      );
    }


    const monthInfo =
      getMonthInfo(
        latest.time
      );


    if (!monthInfo) {
      throw new Error(
        `Thời gian vận hành không hợp lệ: ${latest.time}`
      );
    }


    /* ============================================================
       LOAD DATA
       ============================================================ */

    const [
      rows24hRaw,
      monthRowsRaw,
      frequencyRows,
      storageRows,
    ] =
      await Promise.all([

        /*
         * 24 bản ghi mới nhất.
         */
        supabaseSelect(
          "reservoir_hourly_data",
          {
            select:
              "time,inflow,turbine_flow",

            order:
              "time.desc",

            limit:
              24,
          }
        ),


        /*
         * Q về từ đầu tháng đến mốc mới nhất.
         */
        supabaseSelect(
          "reservoir_hourly_data",
          {
            select:
              "time,inflow",

            and:
              `(time.gte.${monthInfo.start},time.lte.${latest.time})`,

            order:
              "time.asc",

            limit:
              2500,
          }
        ),


        /*
         * Bảng tần suất thủy văn tháng.
         */
        supabaseSelect(
          "monthly_inflow_frequency",
          {
            select:
              "month,frequency_percent,inflow_value",

            month:
              `eq.${monthInfo.month}`,

            order:
              "inflow_value.asc",

            limit:
              500,
          }
        ),


        /*
         * Dung tích hiện tại.
         */
        supabaseSelect(
          "v_current_storage",
          {
            select:
              "*",

            order:
              "time.desc",

            limit:
              1,
          }
        ),
      ]);


    /* ============================================================
       PREPARE DATA
       ============================================================ */

    const rows24h =
      uniqueByTime(
        rows24hRaw
      );


    const monthRows =
      uniqueByTime(
        monthRowsRaw
      );


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


    const averageInflowMonth =
      average(
        monthRows.map(
          (row) =>
            row.inflow
        )
      );


    /* ============================================================
       HYDROLOGY FREQUENCY
       ============================================================ */

    const frequencyResult =
      Number.isFinite(
        averageInflowMonth
      )
        ? interpolateFrequency(
            frequencyRows,
            averageInflowMonth
          )
        : {
            percent:
              null,

            lower:
              null,

            upper:
              null,

            source_scale:
              null,
          };


    /*
     * Kết quả cuối cùng luôn là % thang 0..100.
     *
     * Ví dụ:
     *
     * database = 0.2
     * API      = 20
     */
    const frequencyPercent =
      round(
        frequencyResult.percent,
        1
      );


    /* ============================================================
       STORAGE
       ============================================================ */

    const currentStorage =
      getStorageValue(
        storageRows?.[0]
      );


    /*
     * Dung tích hữu ích hiện có:
     *
     * V hiện tại - dung tích chết.
     */
    const usefulVolume =
      Number.isFinite(
        currentStorage
      )
        ? Math.max(
            0,

            currentStorage -
            DEAD_VOLUME_MILLION_M3
          )
        : null;


    /* ============================================================
       DEAD LEVEL
       ============================================================ */

    const deadLevelForecast =
      calculateDeadLevelForecast({
        usefulVolumeMillionM3:
          usefulVolume,

        inflow24h:
          averageInflow24h,

        turbine24h:
          averageTurbine24h,
      });


    /* ============================================================
       RESPONSE
       ============================================================ */

    return sendJson(
      res,
      200,
      {
        ok:
          true,


        generated_at:
          new Date()
            .toISOString(),


        source_time:
          latest.time,


        /* ========================================================
           HYDROLOGY FREQUENCY
           ======================================================== */

        hydrology_frequency: {

          /*
           * Giữ field cũ để PWA cũ vẫn chạy.
           *
           * Đơn vị từ bản này trở đi:
           *
           *     20 = 20%
           */
          percent:
            frequencyPercent,


          /*
           * Field rõ nghĩa cho frontend mới.
           *
           * Khuyến nghị PWA ưu tiên field này.
           */
          frequency_percent:
            frequencyPercent,


          percent_unit:
            "%",


          /*
           * Cho phép debug:
           *
           * ratio_0_1
           * hoặc
           * percent_0_100
           */
          source_scale:
            frequencyResult.source_scale,


          /*
           * Nhóm tần suất.
           *
           * Hàm classifyFrequency nhận thang 0..100.
           */
          group:
            classifyFrequency(
              frequencyPercent
            ),


          note:
            Number.isFinite(
              frequencyPercent
            )
              ? (
                  `Q về TB tháng ${monthInfo.month}: ` +
                  `${round(
                    averageInflowMonth,
                    2
                  )} m³/s`
                )
              : (
                  `Chưa tính được tần suất tháng ` +
                  `${monthInfo.month}`
                ),


          month:
            monthInfo.month,


          average_inflow_month_m3s:
            round(
              averageInflowMonth,
              2
            ),


          lower_reference:
            frequencyResult.lower,


          upper_reference:
            frequencyResult.upper,
        },


        /* ========================================================
           DEAD LEVEL FORECAST
           ======================================================== */

        dead_level_forecast: {
          ...deadLevelForecast,


          useful_volume_million_m3:
            round(
              usefulVolume,
              2
            ),


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
        },
      }
    );

  } catch (error) {

    console.error(
      "mobile-extra error:",
      error
    );


    return sendJson(
      res,
      500,
      {
        ok:
          false,

        error:
          error?.message ||
          "Lỗi máy chủ không xác định",
      }
    );
  }
}
