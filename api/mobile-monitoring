/**
 * api/mobile-monitoring.js
 *
 * API tổng hợp:
 * 1. Mực nước hạ du Hội Khách - Ái Nghĩa từ Supabase.
 * 2. Số liệu các hồ liên quan từ API PCTT Đà Nẵng:
 *    - 1: A Vương
 *    - 2: Đăk Mi 4
 *    - 3: Sông Bung 4
 *    - 4: Sông Tranh 2
 *
 * URL:
 * /api/mobile-monitoring?hours=24
 * /api/mobile-monitoring?hours=48
 * /api/mobile-monitoring?hours=72
 *
 * Environment Variables trên Vercel:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Frontend gửi:
 * Authorization: Bearer <supabase_access_token>
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const PCTT_API_URL =
  "https://pctt.danang.gov.vn/" +
  "DesktopModules/PCTT/api/PCTTApi/" +
  "baocaothuydiens_thongke";

const VN_OFFSET_HOURS = 7;

const ALLOWED_HOURS = [
  24,
  48,
  72,
];

const RESERVOIR_MAPPING = [
  {
    index: 1,
    code: "A_VUONG",
    name: "A Vương",
    include_in_related: false,
  },
  {
    index: 2,
    code: "DAK_MI_4",
    name: "Đăk Mi 4",
    include_in_related: true,
  },
  {
    index: 3,
    code: "SONG_BUNG_4",
    name: "Sông Bung 4",
    include_in_related: true,
  },
  {
    index: 4,
    code: "SONG_TRANH_2",
    name: "Sông Tranh 2",
    include_in_related: true,
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
   BASIC HELPERS
====================================================== */

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

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  const power =
    10 ** digits;

  return (
    Math.round(
      number * power
    ) / power
  );
}

function clampHours(value) {
  const hours =
    Number(value);

  if (
    ALLOWED_HOURS.includes(hours)
  ) {
    return hours;
  }

  return 24;
}

function normalizeIsoTime(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
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

  const bodyText =
    await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: 401,

      error:
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",

      detail:
        bodyText.slice(
          0,
          300
        ),
    };
  }

  try {
    return {
      ok: true,
      user:
        JSON.parse(bodyText),
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

  const bodyText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase SELECT ${table} ` +
      `${response.status}: ` +
      bodyText.slice(
        0,
        500
      )
    );
  }

  try {
    return JSON.parse(
      bodyText
    );
  } catch {
    throw new Error(
      `Supabase trả dữ liệu không hợp lệ từ ${table}`
    );
  }
}

/* ======================================================
   DATE / TIME
====================================================== */

function pad2(value) {
  return String(value)
    .padStart(
      2,
      "0"
    );
}

function toVnDateParts(date) {
  const shifted =
    new Date(
      date.getTime() +
      VN_OFFSET_HOURS *
      60 *
      60 *
      1000
    );

  return {
    year:
      shifted.getUTCFullYear(),

    month:
      shifted.getUTCMonth() + 1,

    day:
      shifted.getUTCDate(),

    hour:
      shifted.getUTCHours(),

    minute:
      shifted.getUTCMinutes(),

    second:
      shifted.getUTCSeconds(),
  };
}

function formatPCTTDateTime(date) {
  const p =
    toVnDateParts(date);

  return (
    `${p.year}-` +
    `${pad2(p.month)}-` +
    `${pad2(p.day)}` +
    `T${pad2(p.hour)}:` +
    `${pad2(p.minute)}:` +
    `${pad2(p.second)}` +
    "+07:00"
  );
}

function buildPCTTUrl(
  startTime,
  endTime
) {
  const query =
    new URLSearchParams({
      ngaybatdau:
        formatPCTTDateTime(
          startTime
        ),

      ngayketthuc:
        formatPCTTDateTime(
          endTime
        ),

      lst_thuydien_id:
        "1,2,3,4",
    });

  return (
    `${PCTT_API_URL}?` +
    query.toString()
  );
}

/* ======================================================
   XML PARSER
====================================================== */

function decodeXmlEntities(
  value
) {
  return String(value || "")
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      "\""
    )
    .replace(
      /&apos;/g,
      "'"
    )
    .replace(
      /&amp;/g,
      "&"
    );
}

function getXmlTagValue(
  xml,
  tagName
) {
  const escaped =
    tagName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const pattern =
    new RegExp(
      `<${escaped}(?:\\s[^>]*)?>` +
      `([\\s\\S]*?)` +
      `</${escaped}>`,
      "i"
    );

  const match =
    String(xml || "")
      .match(pattern);

  if (!match) {
    return null;
  }

  return decodeXmlEntities(
    match[1]
  ).trim();
}

function parsePCTTXml(
  xmlText
) {
  const xml =
    String(xmlText || "");

  const tableMatches =
    xml.match(
      /<Table(?:\s[^>]*)?>[\s\S]*?<\/Table>/gi
    ) || [];

  const rows = [];

  for (
    const tableXml
    of tableMatches
  ) {
    const timeRaw =
      getXmlTagValue(
        tableXml,
        "thoigianxa"
      );

    const timeIso =
      normalizeIsoTime(
        timeRaw
      );

    if (!timeIso) {
      continue;
    }

    const row = {
      time:
        timeIso,

      raw_time:
        timeRaw,

      date_text:
        getXmlTagValue(
          tableXml,
          "ngay"
        ),

      hour_text:
        getXmlTagValue(
          tableXml,
          "gio"
        ),

      basin_flow: {
        vu_gia_m3s:
          round(
            toNumber(
              getXmlTagValue(
                tableXml,
                "qvevugia"
              )
            ),
            2
          ),

        thu_bon_m3s:
          round(
            toNumber(
              getXmlTagValue(
                tableXml,
                "qvethubon"
              )
            ),
            2
          ),
      },

      reservoirs: [],
    };

    for (
      const reservoir
      of RESERVOIR_MAPPING
    ) {
      const index =
        reservoir.index;

      const waterLevel =
        toNumber(
          getXmlTagValue(
            tableXml,
            `htl${index}`
          )
        );

      const inflow =
        toNumber(
          getXmlTagValue(
            tableXml,
            `qvao${index}`
          )
        );

      const turbineFlow =
        toNumber(
          getXmlTagValue(
            tableXml,
            `luuluongnhamay${index}`
          )
        );

      const spillwayFlow =
        toNumber(
          getXmlTagValue(
            tableXml,
            `qxaquacua${index}`
          )
        );

      const totalOutflow =
        (
          Number.isFinite(
            turbineFlow
          ) ||
          Number.isFinite(
            spillwayFlow
          )
        )
          ? (
              toNumber(
                turbineFlow,
                0
              ) +
              toNumber(
                spillwayFlow,
                0
              )
            )
          : null;

      row.reservoirs.push({
        code:
          reservoir.code,

        name:
          reservoir.name,

        index,

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
            totalOutflow,
            2
          ),
      });
    }

    rows.push(row);
  }

  return rows.sort(
    (a, b) =>
      new Date(a.time).getTime() -
      new Date(b.time).getTime()
  );
}

/* ======================================================
   PCTT FETCH
====================================================== */

async function fetchPCTTData(
  startTime,
  endTime
) {
  const url =
    buildPCTTUrl(
      startTime,
      endTime
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      15000
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Accept:
              "application/xml,text/xml,*/*",

            "User-Agent":
              "avuong-pwa-monitoring/1.0",
          },

          signal:
            controller.signal,
        }
      );

    const bodyText =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `PCTT API HTTP ${response.status}: ` +
        bodyText.slice(
          0,
          500
        )
      );
    }

    const rows =
      parsePCTTXml(
        bodyText
      );

    if (!rows.length) {
      throw new Error(
        "PCTT API không trả về bản ghi Table hợp lệ"
      );
    }

    return {
      ok: true,
      url,
      rows,
      count:
        rows.length,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      rows: [],
      count: 0,

      error:
        error?.name ===
        "AbortError"
          ? "PCTT API timeout sau 15 giây"
          : (
              error?.message ||
              "Lỗi PCTT API không xác định"
            ),
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/* ======================================================
   DOWNSTREAM
====================================================== */

async function loadDownstream(
  startTime,
  endTime
) {
  const rows =
    await supabaseSelect(
      "downstream_manual_observations",
      {
        select:
          "id," +
          "obs_hour," +
          "obs_time," +
          "hoi_khach_m," +
          "ai_nghia_m," +
          "source," +
          "note," +
          "created_by," +
          "created_at," +
          "updated_at",

        obs_hour:
          `gte.${startTime.toISOString()}`,

        order:
          "obs_hour.asc",

        limit:
          500,
      }
    );

  const filtered =
    (rows || [])
      .filter(
        (row) => {
          const time =
            new Date(
              row.obs_hour ||
              row.obs_time ||
              0
            ).getTime();

          return (
            Number.isFinite(time) &&
            time <=
            endTime.getTime()
          );
        }
      )
      .map(
        (row) => ({
          id:
            row.id || null,

          obs_hour:
            normalizeIsoTime(
              row.obs_hour ||
              row.obs_time
            ),

          obs_time:
            normalizeIsoTime(
              row.obs_time ||
              row.obs_hour
            ),

          hoi_khach_m:
            round(
              toNumber(
                row.hoi_khach_m
              ),
              2
            ),

          ai_nghia_m:
            round(
              toNumber(
                row.ai_nghia_m
              ),
              2
            ),

          source:
            row.source ||
            null,

          note:
            row.note ||
            "",

          created_by:
            row.created_by ||
            null,

          created_at:
            row.created_at ||
            null,

          updated_at:
            row.updated_at ||
            null,
        })
      )
      .sort(
        (a, b) =>
          new Date(
            a.obs_hour
          ).getTime() -
          new Date(
            b.obs_hour
          ).getTime()
      );

  const latest =
    filtered.length
      ? filtered[
          filtered.length - 1
        ]
      : null;

  return {
    latest,
    history:
      filtered,

    count:
      filtered.length,
  };
}

/* ======================================================
   RESERVOIR RESPONSE BUILDER
====================================================== */

function buildRelatedReservoirs(
  pcttRows
) {
  const result = [];

  for (
    const config
    of RESERVOIR_MAPPING
  ) {
    if (
      !config.include_in_related
    ) {
      continue;
    }

    const history =
      pcttRows
        .map(
          (row) => {
            const data =
              row.reservoirs.find(
                (item) =>
                  item.index ===
                  config.index
              );

            if (!data) {
              return null;
            }

            return {
              time:
                row.time,

              water_level_m:
                data.water_level_m,

              inflow_m3s:
                data.inflow_m3s,

              turbine_flow_m3s:
                data.turbine_flow_m3s,

              spillway_flow_m3s:
                data.spillway_flow_m3s,

              total_outflow_m3s:
                data.total_outflow_m3s,

              source:
                "pctt_danang",
            };
          }
        )
        .filter(Boolean);

    result.push({
      code:
        config.code,

      name:
        config.name,

      latest:
        history.length
          ? history[
              history.length - 1
            ]
          : null,

      history,

      count:
        history.length,
    });
  }

  return result;
}

function buildBasinFlow(
  pcttRows
) {
  const history =
    pcttRows.map(
      (row) => ({
        time:
          row.time,

        vu_gia_m3s:
          row.basin_flow
            .vu_gia_m3s,

        thu_bon_m3s:
          row.basin_flow
            .thu_bon_m3s,

        source:
          "pctt_danang",
      })
    );

  return {
    latest:
      history.length
        ? history[
            history.length - 1
          ]
        : null,

    history,

    count:
      history.length,
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
    requireEnvironment();

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

    const hours =
      clampHours(
        req.query.hours
      );

    const endTime =
      new Date();

    const startTime =
      new Date(
        endTime.getTime() -
        hours *
        60 *
        60 *
        1000
      );

    const [
      downstreamResult,
      pcttResult,
    ] =
      await Promise.allSettled([
        loadDownstream(
          startTime,
          endTime
        ),

        fetchPCTTData(
          startTime,
          endTime
        ),
      ]);

    let downstream = {
      latest: null,
      history: [],
      count: 0,
    };

    let downstreamError =
      null;

    if (
      downstreamResult.status ===
      "fulfilled"
    ) {
      downstream =
        downstreamResult.value;
    } else {
      downstreamError =
        downstreamResult.reason
          ?.message ||
        "Lỗi tải dữ liệu hạ du";
    }

    let pcttData = {
      ok: false,
      rows: [],
      count: 0,
      url: null,
      error:
        "Chưa tải được PCTT",
    };

    if (
      pcttResult.status ===
      "fulfilled"
    ) {
      pcttData =
        pcttResult.value;
    } else {
      pcttData = {
        ok: false,
        rows: [],
        count: 0,
        url: null,

        error:
          pcttResult.reason
            ?.message ||
          "Lỗi tải PCTT",
      };
    }

    const relatedReservoirs =
      buildRelatedReservoirs(
        pcttData.rows
      );

    const basinFlow =
      buildBasinFlow(
        pcttData.rows
      );

    const downstreamOk =
      downstream.count > 0;

    const relatedOk =
      pcttData.ok &&
      relatedReservoirs.some(
        (item) =>
          item.count > 0
      );

    const partial =
      !downstreamOk ||
      !relatedOk;

    return sendJson(
      res,
      200,
      {
        ok:
          downstreamOk ||
          relatedOk,

        partial,

        mode:
          "mobile-monitoring",

        hours,

        generated_at:
          new Date()
            .toISOString(),

        period: {
          start:
            startTime
              .toISOString(),

          end:
            endTime
              .toISOString(),
        },

        user: {
          id:
            auth.user?.id ||
            null,

          email:
            auth.user?.email ||
            null,
        },

        downstream,

        related_reservoirs:
          relatedReservoirs,

        basin_flow:
          basinFlow,

        diagnostics: {
          downstream: {
            ok:
              downstreamOk,

            count:
              downstream.count,

            error:
              downstreamError,
          },

          pctt: {
            ok:
              pcttData.ok,

            count:
              pcttData.count,

            error:
              pcttData.error ||
              null,

            url:
              pcttData.url ||
              null,
          },
        },
      },

      "private, max-age=0, s-maxage=120, stale-while-revalidate=300"
    );
  } catch (error) {
    console.error(
      "mobile-monitoring error:",
      error
    );

    return sendJson(
      res,
      500,
      {
        ok: false,

        mode:
          "mobile-monitoring",

        error:
          error?.message ||
          "Lỗi máy chủ không xác định",
      }
    );
  }
}
