/**
 * api/mobile-monitoring.js
 *
 * Gộp dữ liệu:
 * - Hạ du Hội Khách, Ái Nghĩa từ Supabase.
 * - Đăk Mi 4, Sông Bung 4, Sông Tranh 2 từ XML PCTT Đà Nẵng.
 *
 * URL:
 * /api/mobile-monitoring?hours=24
 * /api/mobile-monitoring?hours=48
 * /api/mobile-monitoring?hours=72
 *
 * Environment Variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const PCTT_API_URL =
  "https://pctt.danang.gov.vn/" +
  "DesktopModules/PCTT/api/PCTTApi/" +
  "baocaothuydiens_thongke";

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
    include: false,
  },
  {
    index: 2,
    code: "DAK_MI_4",
    name: "Đăk Mi 4",
    include: true,
  },
  {
    index: 3,
    code: "SONG_BUNG_4",
    name: "Sông Bung 4",
    include: true,
  },
  {
    index: 4,
    code: "SONG_TRANH_2",
    name: "Sông Tranh 2",
    include: true,
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

function normalizeHours(value) {
  const hours =
    Number(value);

  return ALLOWED_HOURS.includes(hours)
    ? hours
    : 24;
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

  const body =
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
        JSON.parse(body),
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

  const body =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase SELECT ${table} ` +
      `${response.status}: ` +
      body.slice(
        0,
        500
      )
    );
  }

  try {
    return JSON.parse(
      body
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

function getVnParts(date) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Ho_Chi_Minh",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,
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

  return result;
}

function formatPCTTDateTime(date) {
  const p =
    getVnParts(date);

  return (
    `${p.year}-` +
    `${p.month}-` +
    `${p.day}` +
    `T${p.hour}:` +
    `${p.minute}:` +
    `${p.second}` +
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

function normalizePCTTTime(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function getVietnamHourKey(
  value
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  const p =
    getVnParts(date);

  return (
    `${p.year}-` +
    `${p.month}-` +
    `${p.day}` +
    `T${p.hour}:00`
  );
}

/* ======================================================
   XML PARSER
====================================================== */

function decodeXmlEntities(value) {
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

  return match
    ? decodeXmlEntities(
        match[1]
      ).trim()
    : null;
}

function parsePCTTXml(
  xmlText
) {
  const matches =
    String(xmlText || "")
      .match(
        /<Table(?:\s[^>]*)?>[\s\S]*?<\/Table>/gi
      ) || [];

  const parsed = [];

  for (
    const tableXml
    of matches
  ) {
    const time =
      normalizePCTTTime(
        getXmlTagValue(
          tableXml,
          "thoigianxa"
        )
      );

    if (!time) {
      continue;
    }

    const reservoirs = [];

    for (
      const config
      of RESERVOIR_MAPPING
    ) {
      const index =
        config.index;

      const waterLevel =
        toNumber(
          getXmlTagValue(
            tableXml,
            `htl${index}`
          ),
          null
        );

      const inflow =
        toNumber(
          getXmlTagValue(
            tableXml,
            `qvao${index}`
          ),
          null
        );

      const turbine =
        toNumber(
          getXmlTagValue(
            tableXml,
            `luuluongnhamay${index}`
          ),
          null
        );

      const spillway =
        toNumber(
          getXmlTagValue(
            tableXml,
            `qxaquacua${index}`
          ),
          null
        );

      reservoirs.push({
        index,

        code:
          config.code,

        name:
          config.name,

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
            turbine,
            2
          ),

        spillway_flow_m3s:
          round(
            spillway,
            2
          ),

        total_outflow_m3s:
          (
            turbine === null &&
            spillway === null
          )
            ? null
            : round(
                (
                  turbine || 0
                ) +
                (
                  spillway || 0
                ),
                2
              ),
      });
    }

    parsed.push({
      time,

      hour_key:
        getVietnamHourKey(
          time
        ),

      basin_flow: {
        vu_gia_m3s:
          round(
            toNumber(
              getXmlTagValue(
                tableXml,
                "qvevugia"
              ),
              null
            ),
            2
          ),

        thu_bon_m3s:
          round(
            toNumber(
              getXmlTagValue(
                tableXml,
                "qvethubon"
              ),
              null
            ),
            2
          ),
      },

      reservoirs,
    });
  }

  /*
    Loại trùng theo giờ Việt Nam.

    Nếu API trả nhiều bản ghi
    trong cùng một giờ,
    giữ bản ghi xuất hiện sau cùng.
  */
  const byHour =
    new Map();

  for (
    const row
    of parsed
  ) {
    if (row.hour_key) {
      byHour.set(
        row.hour_key,
        row
      );
    }
  }

  return [
    ...byHour.values(),
  ].sort(
    (a, b) =>
      new Date(
        a.time
      ).getTime() -
      new Date(
        b.time
      ).getTime()
  );
}

/* ======================================================
   HOUR FILTER
====================================================== */

function buildAllowedHourKeys(
  endTime,
  hours
) {
  const end =
    new Date(endTime);

  end.setUTCMinutes(
    0,
    0,
    0
  );

  const keys = [];

  for (
    let index = 0;
    index < hours;
    index += 1
  ) {
    const slot =
      new Date(
        end.getTime() -
        index *
        60 *
        60 *
        1000
      );

    const key =
      getVietnamHourKey(
        slot
      );

    if (key) {
      keys.push(key);
    }
  }

  return new Set(keys);
}

/* ======================================================
   PCTT FETCH
====================================================== */

async function fetchPCTT(
  startTime,
  endTime,
  hours
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
      () => {
        controller.abort();
      },
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
              "avuong-pwa-monitoring/2.0",
          },

          signal:
            controller.signal,
        }
      );

    const body =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `PCTT API HTTP ` +
        `${response.status}: ` +
        body.slice(
          0,
          500
        )
      );
    }

    const rows =
      parsePCTTXml(
        body
      );

    const allowed =
      buildAllowedHourKeys(
        endTime,
        hours
      );

    const filtered =
      rows.filter(
        (row) =>
          allowed.has(
            row.hour_key
          )
      );

    return {
      ok: true,
      url,

      rows:
        filtered,

      raw_count:
        rows.length,

      count:
        filtered.length,
    };
  } catch (error) {
    return {
      ok: false,
      url,

      rows: [],

      raw_count:
        0,

      count:
        0,

      error:
        error?.name ===
        "AbortError"
          ? "PCTT API timeout sau 15 giây"
          : (
              error?.message ||
              "Lỗi PCTT không xác định"
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

  const map =
    new Map();

  for (
    const row
    of rows || []
  ) {
    const timeRaw =
      row.obs_hour ||
      row.obs_time;

    const time =
      new Date(timeRaw);

    if (
      Number.isNaN(
        time.getTime()
      ) ||
      time.getTime() >
      endTime.getTime()
    ) {
      continue;
    }

    const key =
      getVietnamHourKey(
        time
      );

    if (!key) {
      continue;
    }

    map.set(
      key,
      {
        id:
          row.id ||
          null,

        obs_hour:
          time.toISOString(),

        obs_time:
          row.obs_time ||
          row.obs_hour,

        hoi_khach_m:
          round(
            toNumber(
              row.hoi_khach_m,
              null
            ),
            2
          ),

        ai_nghia_m:
          round(
            toNumber(
              row.ai_nghia_m,
              null
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
      }
    );
  }

  const history =
    [
      ...map.values(),
    ].sort(
      (a, b) =>
        new Date(
          a.obs_hour
        ).getTime() -
        new Date(
          b.obs_hour
        ).getTime()
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
   RELATED RESERVOIRS
====================================================== */

function buildRelatedReservoirs(
  rows
) {
  return RESERVOIR_MAPPING
    .filter(
      (config) =>
        config.include
    )
    .map(
      (config) => {
        const history =
          rows
            .map(
              (row) => {
                const data =
                  row.reservoirs
                    .find(
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

                  hour_key:
                    row.hour_key,

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

        return {
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
        };
      }
    );
}

function buildBasinFlow(
  rows
) {
  const history =
    rows.map(
      (row) => ({
        time:
          row.time,

        hour_key:
          row.hour_key,

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

    const hours =
      normalizeHours(
        req.query.hours
      );

    const endTime =
      new Date();

    /*
      Lấy dư 2 giờ ở đầu
      để phòng API PCTT làm tròn biên.

      Sau đó sẽ lọc lại chính xác
      theo 24h / 48h / 72h.
    */
    const pcttStartTime =
      new Date(
        endTime.getTime() -
        (
          hours + 2
        ) *
        60 *
        60 *
        1000
      );

    const downstreamStartTime =
      new Date(
        endTime.getTime() -
        hours *
        60 *
        60 *
        1000
      );

    const [
      downstreamSettled,
      pcttSettled,
    ] =
      await Promise.allSettled([
        loadDownstream(
          downstreamStartTime,
          endTime
        ),

        fetchPCTT(
          pcttStartTime,
          endTime,
          hours
        ),
      ]);

    const downstream =
      downstreamSettled.status ===
      "fulfilled"
        ? downstreamSettled.value
        : {
            latest:
              null,

            history:
              [],

            count:
              0,
          };

    const downstreamError =
      downstreamSettled.status ===
      "rejected"
        ? (
            downstreamSettled
              .reason
              ?.message ||
            "Lỗi tải dữ liệu hạ du"
          )
        : null;

    const pctt =
      pcttSettled.status ===
      "fulfilled"
        ? pcttSettled.value
        : {
            ok:
              false,

            rows:
              [],

            count:
              0,

            raw_count:
              0,

            url:
              null,

            error:
              pcttSettled
                .reason
                ?.message ||
              "Lỗi tải dữ liệu PCTT",
          };

    const relatedReservoirs =
      buildRelatedReservoirs(
        pctt.rows
      );

    const basinFlow =
      buildBasinFlow(
        pctt.rows
      );

    const downstreamOk =
      downstream.count > 0;

    const relatedOk =
      relatedReservoirs.some(
        (item) =>
          item.count > 0
      );

    return sendJson(
      res,
      200,
      {
        ok:
          downstreamOk ||
          relatedOk,

        partial:
          !downstreamOk ||
          !relatedOk,

        mode:
          "mobile-monitoring",

        hours,

        generated_at:
          new Date()
            .toISOString(),

        time_zone:
          "Asia/Ho_Chi_Minh",

        period: {
          start:
            downstreamStartTime
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
              pctt.ok,

            count:
              pctt.count,

            raw_count:
              pctt.raw_count,

            error:
              pctt.error ||
              null,

            url:
              pctt.url ||
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
        ok:
          false,

        mode:
          "mobile-monitoring",

        error:
          error?.message ||
          "Lỗi máy chủ không xác định",
      }
    );
  }
}
