const { default: axios } = require("axios");
const qs = require("qs");
const _ = require("lodash");
const dayjs = require("dayjs");

function numberCommaReplaceAll(str, type = "Int") {
  if (!str) return str;
  const replaceStr = str.replace(/,/g, "");

  if (type === "Int") {
    return parseInt(replaceStr, 10);
  } else if (type === "Float") {
    return parseFloat(replaceStr);
  } else return replaceStr;
}

function getStep2Years(startDt, endDt, step = 2) {
  const strFormat = "YYYYMMDD";
  const sDt = dayjs(startDt, strFormat);
  const eDt = dayjs(endDt, strFormat);
  const results = [];
  let nextDt = sDt;
  while (nextDt.unix() < eDt.unix()) {
    if (!nextDt) {
      nextDt = sDt.add(step, "year");
      results.push([
        sDt.format(strFormat),
        nextDt.subtract(1, "day").format(strFormat),
      ]);
    } else {
      const nextStartDt = _.cloneDeep(nextDt);
      nextDt = nextDt.add(step, "year");
      let nextEndDt = nextDt.subtract(1, "day");
      if (nextEndDt.unix() > eDt.unix()) nextEndDt = eDt;
      results.push([
        nextStartDt.format(strFormat),
        nextEndDt.format(strFormat),
      ]);
    }
  }
  return results;
}

class CustomHttp {
  constructor(baseURL) {
    this.instance = null;
    this.baseURL = baseURL;
  }

  init() {
    this.instance = axios.create({
      baseURL: this.baseURL,
      responseType: "json",
      timeout: 10000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    this.instance.interceptors.request.use(function (ctx) {
      console.log(`[axios request] ${ctx.method} - `, qs.parse(ctx.data));
      return ctx;
    });
  }

  commonBody() {
    return {
      locale: "ko_KR",
      share: 1,
      money: 1,
    };
  }

  async post(url, body) {
    const mergeBady = _.merge(this.commonBody(), body);
    const { data } = await this.instance.post(url, qs.stringify(mergeBady));
    return data;
  }
}

class KtrData {
  constructor(http, firstStartDt) {
    this.http = http;
    this.firstStartDt = firstStartDt;
    this.endDt = dayjs(new Date()).subtract(1, "day").format("YYYYMMDD");
    this.url = "/comm/bldAttendant/getJsonData.cmd";
  }

  // 여러개 비동기 처리
  async asyncFetchDatasByStep(fetchFn) {
    const years = getStep2Years(this.firstStartDt, this.endDt);

    const promises = [];
    years.forEach((y) => {
      promises.push(fetchFn(y[0], y[1]));
    });
    const pResults = await Promise.all(promises);

    const results = [];
    pResults.forEach((item) => {
      results.push(...item);
    });
    return results;
  }

  /**
   * [ 전 종목 기본 정보(코스피, 코스닥) ]
   *
   * @typedef {Object} BasicStockInfo
   * @property {string} ISU_CD - 표준코드
   * @property {string} ISU_SRT_CD - 단축코드
   * @property {string} ISU_NM - 한글종목명
   * @property {string} ISU_ABBRV - 한글종목약명
   * @property {string} ISU_ENG_NM - 영문종목명
   * @property {string} LIST_DD - 상장일
   * @property {string} MKT_TP_NM - 시장구분
   * @property {string} SECUGRP_NM - 증권구분
   * @property {string} SECT_TP_NM - 소속부
   * @property {string} KIND_STKCERT_TP_NM - 주식종류
   * @property {number} PARVAL - 액면가
   * @property {number} LIST_SHRS - 상장주식수
   *
   * @return {BasicStockInfo[]}
   */
  async basicStockInfos() {
    console.log(`[basicStockInfos - START]`);
    const resSTK = await this.http.post("/comm/bldAttendant/getJsonData.cmd", {
      bld: "dbms/MDC/STAT/standard/MDCSTAT01901",
      mktId: "STK",
      csvxls_isNo: false,
    });
    const resKSQ = await this.http.post("/comm/bldAttendant/getJsonData.cmd", {
      bld: "dbms/MDC/STAT/standard/MDCSTAT01901",
      mktId: "KSQ",
      segTpCd: "ALL",
      csvxls_isNo: false,
    });
    const results = [...resSTK.OutBlock_1, ...resKSQ.OutBlock_1];
    const stocks = results.map((item) => ({
      ...item,
      LIST_SHRS: numberCommaReplaceAll(item.LIST_SHRS),
      PARVAL: numberCommaReplaceAll(item.PARVAL),
    }));
    console.log(`[basicStockInfos - END] size: ${stocks.length}`);
    return stocks;
  }

  /**
   * [ 업종분류 현황(코스피, 코스닥) ]
   *
   * @typedef {Object} IndustryClassInfo
   * @property {string} ISU_SRT_CD - 종목코드
   * @property {string} ISU_ABBRV - 종목명
   * @property {string} MKT_TP_NM - 시장구분
   * @property {string} IDX_IND_NM - 업종명
   * @property {number} TDD_CLSPRC - 종가
   * @property {number} CMPPREVDD_PRC - 대비
   * @property {float} FLUC_RT - 등락률
   * @property {number} MKTCAP - 시가총액
   *
   * @return {IndustryClassInfo[]}
   */
  async industryClassInfos() {
    console.log(`[industryClassInfos - START]`);
    const resSTK = await this.http.post("/comm/bldAttendant/getJsonData.cmd", {
      bld: "dbms/MDC/STAT/standard/MDCSTAT03901",
      mktId: "STK",
      trdDd: this.endDt,
    });
    const resKSQ = await this.http.post("/comm/bldAttendant/getJsonData.cmd", {
      bld: "dbms/MDC/STAT/standard/MDCSTAT03901",
      mktId: "KSQ",
      segTpCd: "ALL",
      trdDd: this.endDt,
    });
    const results = [...resSTK.block1, ...resKSQ.block1];
    const stocks = results.map((item) => ({
      ...item,
      CMPPREVDD_PRC: numberCommaReplaceAll(item.CMPPREVDD_PRC),
      FLUC_RT: numberCommaReplaceAll(item.FLUC_RT, "Float"),
      FLUC_TP_CD: numberCommaReplaceAll(item.FLUC_TP_CD),
      MKTCAP: numberCommaReplaceAll(item.MKTCAP),
      TDD_CLSPRC: numberCommaReplaceAll(item.TDD_CLSPRC),
    }));
    console.log(`[industryClassInfos - END] size: ${stocks.length}`);
    return stocks;
  }

  /**
   * [ 일별 코스피 지수 ]
   *
   * @typedef {Object} DayKOSPIIndex
   * @property {string} TRD_DD - 일자
   * @property {float} CLSPRC_IDX - 종가
   * @property {number} FLUC_TP_CD - 등록코드
   * @property {float} PRV_DD_CMPR - 대비
   * @property {float} UPDN_RATE - 등락률
   * @property {float} OPNPRC_IDX - 시가
   * @property {float} HGPRC_IDX - 고가
   * @property {float} LWPRC_IDX - 저가
   * @property {number} ACC_TRDVOL - 거래량
   * @property {number} ACC_TRDVAL - 거래대금
   * @property {number} MKTCAP - 상장시가총액
   *
   * @return {DayKOSPIIndex[]}
   */
  async dayKOSPIIndex() {
    console.log(`[dayKOSPIIndex - START]`);
    const fetchFn = async (strtDd, endDd) => {
      const { output } = await this.http.post(
        "/comm/bldAttendant/getJsonData.cmd",
        {
          bld: "dbms/MDC/STAT/standard/MDCSTAT00301",
          indIdx: 1,
          indIdx2: "001",
          strtDd,
          endDd,
        }
      );
      const results = output.map((item) => ({
        ...item,
        CLSPRC_IDX: numberCommaReplaceAll(item.CLSPRC_IDX, "Float"),
        FLUC_TP_CD: numberCommaReplaceAll(item.FLUC_TP_CD),
        PRV_DD_CMPR: numberCommaReplaceAll(item.PRV_DD_CMPR, "Float"),
        UPDN_RATE: numberCommaReplaceAll(item.UPDN_RATE, "Float"),
        OPNPRC_IDX: numberCommaReplaceAll(item.OPNPRC_IDX, "Float"),
        HGPRC_IDX: numberCommaReplaceAll(item.HGPRC_IDX, "Float"),
        LWPRC_IDX: numberCommaReplaceAll(item.LWPRC_IDX, "Float"),
        ACC_TRDVOL: numberCommaReplaceAll(item.ACC_TRDVOL),
        ACC_TRDVAL: numberCommaReplaceAll(item.ACC_TRDVAL),
        MKTCAP: numberCommaReplaceAll(item.MKTCAP),
      }));
      return results;
    };
    const results = await this.asyncFetchDatasByStep(fetchFn);
    results.sort(
      (a, b) =>
        dayjs(a.TRD_DD, "YYYY/MM/DD").unix() -
        dayjs(b.TRD_DD, "YYYY/MM/DD").unix()
    );
    console.log(`[dayKOSPIIndex - END] size: ${results.length}`);
    return results;
  }

  /**
   * [ 일별 주식 종목(개별) ]
   *
   * @typedef {Object} DayStockPrice
   * @property {string} TRD_DD - 일자
   * @property {number} TDD_CLSPRC - 종가
   * @property {number} FLUC_TP_CD - 등록코드
   * @property {number} CMPPREVDD_PRC - 대비
   * @property {float} FLUC_RT - 등락률
   * @property {number} TDD_OPNPRC - 시가
   * @property {number} TDD_HGPRC - 고가
   * @property {number} TDD_LWPRC - 저가
   * @property {number} ACC_TRDVOL - 거래량
   * @property {number} ACC_TRDVAL - 거래대금
   * @property {number} MKTCAP - 시가총액
   * @property {number} LIST_SHRS - 상장주식수
   *
   * @param {string} isuCd - 표준코드
   * @return {DayStockPrice[]}
   */
  async dayStockPrice(isuCd) {
    console.log(`[dayStockPrice - START]`);
    const { output } = await this.http.post(
      "/comm/bldAttendant/getJsonData.cmd",
      {
        bld: "dbms/MDC/STAT/standard/MDCSTAT01701",
        isuCd: isuCd,
        isuCd2: isuCd,
        strtDd: this.firstStartDt,
        endDd: this.endDt,
        adjStkPrc_check: "Y",
        adjStkPrc: 2,
      }
    );
    const results = output.map((item) => ({
      ...item,
      ACC_TRDVAL: numberCommaReplaceAll(item.ACC_TRDVAL),
      ACC_TRDVOL: numberCommaReplaceAll(item.ACC_TRDVOL),
      CMPPREVDD_PRC: numberCommaReplaceAll(item.CMPPREVDD_PRC),
      FLUC_RT: numberCommaReplaceAll(item.FLUC_RT, "Float"),
      FLUC_TP_CD: numberCommaReplaceAll(item.FLUC_TP_CD),
      LIST_SHRS: numberCommaReplaceAll(item.LIST_SHRS),
      MKTCAP: numberCommaReplaceAll(item.MKTCAP),
      TDD_CLSPRC: numberCommaReplaceAll(item.TDD_CLSPRC),
      TDD_HGPRC: numberCommaReplaceAll(item.TDD_HGPRC),
      TDD_LWPRC: numberCommaReplaceAll(item.TDD_LWPRC),
      TDD_OPNPRC: numberCommaReplaceAll(item.TDD_OPNPRC),
    }));
    console.log(`[dayStockPrice - END] size: ${results.length}`);
    return results;
  }

  /**
   * [ 일별 투자자별 거래실적(개별) - 순매수 ]
   *
   * @typedef {Object} DayRecordByInvestor
   * @property {number} TRDVAL1 - 금융투자
   * @property {number} TRDVAL2 - 보험
   * @property {number} TRDVAL3 - 투신
   * @property {number} TRDVAL4 - 사모
   * @property {number} TRDVAL5 - 은행
   * @property {number} TRDVAL6 - 기타금융
   * @property {number} TRDVAL7 - 연기금 등
   * @property {number} TRDVAL8 - 기타법인
   * @property {number} TRDVAL9 - 개인
   * @property {number} TRDVAL10 - 외국인
   * @property {number} TRDVAL11 - 기타외국인
   * @property {number} TRDVAL_TOT - 전체
   *
   * @param {string} isuCd - 표준코드
   * @return {DayRecordByInvestor[]}
   */
  async dayRecordByInvestor(isuCd) {
    console.log(`[dayRecordByInvestor - START]`);
    const fetchFn = async (strtDd, endDd) => {
      const { output } = await this.http.post(
        "/comm/bldAttendant/getJsonData.cmd",
        {
          bld: "dbms/MDC/STAT/standard/MDCSTAT02303",
          inqTpCd: 2,
          trdVolVal: 2,
          askBid: 3,
          detailView: 1,
          isuCd: isuCd,
          isuCd2: isuCd,
          strtDd,
          endDd,
        }
      );
      const results = output.map((item) => ({
        ...item,
        TRDVAL1: numberCommaReplaceAll(item.TRDVAL1),
        TRDVAL2: numberCommaReplaceAll(item.TRDVAL2),
        TRDVAL3: numberCommaReplaceAll(item.TRDVAL3),
        TRDVAL4: numberCommaReplaceAll(item.TRDVAL4),
        TRDVAL5: numberCommaReplaceAll(item.TRDVAL5),
        TRDVAL6: numberCommaReplaceAll(item.TRDVAL6),
        TRDVAL7: numberCommaReplaceAll(item.TRDVAL7),
        TRDVAL8: numberCommaReplaceAll(item.TRDVAL8),
        TRDVAL9: numberCommaReplaceAll(item.TRDVAL9),
        TRDVAL10: numberCommaReplaceAll(item.TRDVAL10),
        TRDVAL11: numberCommaReplaceAll(item.TRDVAL11),
        TRDVAL_TOT: numberCommaReplaceAll(item.TRDVAL_TOT),
      }));
      return results;
    };
    const results = await this.asyncFetchDatasByStep(fetchFn);
    results.sort(
      (a, b) =>
        dayjs(a.TRD_DD, "YYYY/MM/DD").unix() -
        dayjs(b.TRD_DD, "YYYY/MM/DD").unix()
    );
    console.log(`[dayRecordByInvestor - END] size: ${results.length}`);
    return results;
  }

  /**
   * [ 일별 외국인보유량(개별) ]
   *
   * @typedef {Object} DayForeignOwnership
   * @property {number} CMPPREVDD_PRC - 대비
   * @property {number} FLUC_RT - 등락률
   * @property {number} FLUC_TP_CD - 등락률 코드
   * @property {number} FORN_HD_QTY - 외국인보유수량
   * @property {number} FORN_LMT_EXHST_RT - 외국인 지분율
   * @property {number} FORN_ORD_LMT_QTY - 외국인 한도수량
   * @property {number} FORN_SHR_RT - 외국인 한도소진율
   * @property {number} LIST_SHRS - 상장주식수
   * @property {number} TDD_CLSPRC - 종가
   *
   * @param {string} isuCd - 표준코드
   * @return {DayForeignOwnership[]}
   */
  async dayForeignOwnership(isuCd) {
    console.log(`[dayForeignOwnership - START]`);
    const fetchFn = async (strtDd, endDd) => {
      const { output } = await this.http.post(
        "/comm/bldAttendant/getJsonData.cmd",
        {
          bld: "dbms/MDC/STAT/standard/MDCSTAT03702",
          searchType: 2,
          mktId: "ALL",
          isuCd: isuCd,
          isuCd2: isuCd,
          strtDd,
          endDd,
        }
      );
      const results = output.map((item) => ({
        ...item,
        CMPPREVDD_PRC: numberCommaReplaceAll(item.CMPPREVDD_PRC),
        FLUC_RT: numberCommaReplaceAll(item.FLUC_RT, "Float"),
        FLUC_TP_CD: numberCommaReplaceAll(item.FLUC_TP_CD),
        FORN_HD_QTY: numberCommaReplaceAll(item.FORN_HD_QTY),
        FORN_LMT_EXHST_RT: numberCommaReplaceAll(
          item.FORN_LMT_EXHST_RT,
          "Float"
        ),
        FORN_ORD_LMT_QTY: numberCommaReplaceAll(item.FORN_ORD_LMT_QTY),
        FORN_SHR_RT: numberCommaReplaceAll(item.FORN_SHR_RT, "Float"),
        LIST_SHRS: numberCommaReplaceAll(item.LIST_SHRS),
        TDD_CLSPRC: numberCommaReplaceAll(item.TDD_CLSPRC),
      }));
      return results;
    };
    const results = await this.asyncFetchDatasByStep(fetchFn);
    results.sort(
      (a, b) =>
        dayjs(a.TRD_DD, "YYYY/MM/DD").unix() -
        dayjs(b.TRD_DD, "YYYY/MM/DD").unix()
    );
    console.log(`[dayForeignOwnership - END] size: ${results.length}`);
    return results;
  }
}

async function main() {
  const krxHttp = new CustomHttp("http://data.krx.co.kr");
  krxHttp.init();
  const krxData = new KtrData(krxHttp, "19960101");
  // const basicStocks = await krxData.basicStockInfos();
  // const datas = await krxData.dayKOSPIIndex();
  // const datas = await krxData.industryClassInfos();
  const datas = await krxData.dayForeignOwnership("KR7005930003");
  console.log(datas[0]);
  console.log(datas[datas.length - 1]);
}

main();
