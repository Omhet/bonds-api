import fetch from "node-fetch";

const russian = "ru";
const english = "en";
const siteLanguage = russian;

export let Bonds = {
  isRus: function () {
    return siteLanguage === russian;
  },

  isEng: function () {
    return siteLanguage === english;
  },

  getCurrentLanguage: function () {
    return siteLanguage;
  },

  isEmptyObject: function (obj) {
    return Object.keys(obj).length === 0;
  },

  supportsLocalStorage: function () {
    try {
      const test = "test";
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  },

  updateBond: async function (element) {
    // const bondExists = (element) => {
    //     const bonds = Functions.getBondsInfo();
    //     if (bonds[element.code])
    //        return true;
    //     else
    //        return false;
    // };
    // const restoreBondInfo = (element) => {
    //     const bonds = Functions.getBondsInfo();
    //     const bondInfo = bonds[element.code];
    //     return {...element, ...bondInfo};
    // };
    // const updateBondInfo = (bond) => {
    //     const bonds = Functions.getBondsInfo();
    //     const code = bond.code;
    //     bonds[code] = bond;
    //     Functions.setToLs(bonds, 'bondsInfo');
    // };

    // if (Functions.supportsLocalStorage() && bondExists(element))
    //     return restoreBondInfo(element);

    return Bonds.fetchBondInfo(element.code).then((bond) => {
      if (bond.currency !== "SUR") throw new Error("USD bonds not supported");

      //updateBondInfo(bond);
      return Bonds.addCouponsList({ ...element, ...bond });
    });
  },

  composeRequestUrl: function (code) {
    let board;
    const su = /su/i;
    if (su.test(code)) board = "TQOB";
    else board = "TQCB";
    return (
      "https://iss.moex.com/iss/engines/stock/markets/bonds/boards/" +
      board +
      "/securities/" +
      code
    );
  },

  fetchBondInfo: async function (code) {
    const url = Bonds.composeRequestUrl(code) + ".json";

    return fetch(url)
      .then((response) => response.json())
      .then((json) => {
        const bonds = Bonds.composeBondInfo(json);
        if (!bonds.length) throw new Error(code + " not found in MOEX");

        return bonds[0];
      });
  },

  fetchCouponsList: async function (code) {
    const url =
      "https://iss.moex.com/iss/statistics/engines/stock/markets/bonds/bondization/" +
      code +
      ".json";
    let allCoupons = [];
    let allAmortizations = [];
    let json = await fetch(url).then((response) => response.json());
    let cursor;
    if (json["coupons.cursor"])
      cursor = Bonds.mapColumnsToValues(json, "coupons.cursor")[0];
    let coupons = Bonds.mapColumnsToValues(json, "coupons");
    allCoupons = allCoupons.concat(coupons);
    let amortizations = Bonds.mapColumnsToValues(json, "amortizations");
    allAmortizations = allAmortizations.concat(amortizations);
    let offers = Bonds.mapColumnsToValues(json, "offers");

    while (cursor && cursor.INDEX + cursor.PAGESIZE < cursor.TOTAL) {
      json = await fetch(
        url + "?start=" + (cursor.INDEX + cursor.PAGESIZE)
      ).then((response) => response.json());
      coupons = Bonds.mapColumnsToValues(json, "coupons");
      amortizations = Bonds.mapColumnsToValues(json, "amortizations");
      allCoupons = allCoupons.concat(coupons);
      if (amortizations.length)
        allAmortizations = allAmortizations.concat(amortizations);
      if (json["coupons.cursor"])
        cursor = Bonds.mapColumnsToValues(json, "coupons.cursor")[0];
      else cursor = undefined;
    }
    return {
      coupons: Bonds.filterCouponsData(allCoupons),
      amortizations: Bonds.filterAmortizationData(allAmortizations),
      offers: Bonds.filterOfferData(offers),
    };
  },

  addCouponsList: async function (bond) {
    const isEmpty = (obj) => Object.keys(obj).length === 0;
    return Bonds.fetchCouponsList(bond.code).then(
      ({ coupons, amortizations, offers }) => {
        if (coupons.length) bond.couponsList = coupons;
        if (amortizations && !isEmpty(amortizations))
          bond.amortizations = amortizations;
        if (offers && !isEmpty(offers)) bond.offers = offers;
        return bond;
      }
    );
  },

  fetchDayCandles: async function (code) {
    const tillDate = new Date();
    const fromDate = new Date(tillDate.getTime());
    fromDate.setMonth(fromDate.getMonth() - 23);
    const fromDateString = Bonds.composeMySqlDate(fromDate);
    const tillDateString = Bonds.composeMySqlDate(tillDate);
    const url =
      Bonds.composeRequestUrl(code) +
      "/candles.json?from=" +
      fromDateString +
      "&till=" +
      tillDateString +
      "&interval=24";
    return fetch(url)
      .then((response) => response.json())
      .then((json) => {
        const candles = Bonds.mapCandles(json);
        return candles;
      });
  },

  fetchMinuteCandles: async function (code, date) {
    const url =
      Bonds.composeRequestUrl(code) +
      "/candles.json?from=" +
      date +
      "&till=" +
      date +
      "&interval=1";
    return fetch(url)
      .then((response) => response.json())
      .then((json) => {
        const candles = Bonds.mapCandles(json, true);
        return candles;
      });
  },

  composeMySqlDate: function (date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
  },

  getFromLs: function (name) {
    if (Bonds.supportsLocalStorage()) {
      try {
        let data = window.localStorage.getItem(name);
        if (data) data = JSON.parse(data);
        return data;
      } catch (error) {
        if (Bonds.supportsLocalStorage()) window.localStorage.removeItem(name);
        window.location.reload();
      }
    }
  },

  setToLs: function (data, name) {
    if (Bonds.supportsLocalStorage()) {
      data = JSON.stringify(data);
      window.localStorage.setItem(name, data);
    }
  },

  getBondsInfo: function () {
    return this.getFromLs("bondsInfo") || {};
  },

  getMyBonds: function () {
    return this.getFromLs("myBonds") || [];
  },

  updateMyBonds: function (bonds) {
    return this.setToLs(bonds, "myBonds");
  },

  getNewBonds: function () {
    return this.getFromLs("newBonds") || [];
  },

  updateNewBonds: function (bonds) {
    Bonds.setToLs(bonds, "newBonds");
  },

  getStorageBonds: function (storage) {
    return this.getFromLs(storage) || [];
  },

  updateStorageBonds: function (bonds, storage) {
    Bonds.setToLs(bonds, storage);
  },

  calculate: function (inputData, priceType, realRatePeriod) {
    const bond = { ...inputData };
    if (!priceType) priceType = "lastPrice";
    bond.priceType = priceType;
    switch (priceType) {
      case "lastPrice":
        bond.relativePrice = bond.currentPercent;
        break;
      case "bid":
        bond.relativePrice = bond.bid;
        break;
      case "offer":
        bond.relativePrice = bond.offer;
        break;
      default:
        bond.relativePrice = bond.currentPercent;
        break;
    }
    const todayMilliseconds = getTodayMilliseconds();
    if (Bonds.isDateValid(bond.repaymentDate))
      bond.daysTillRedemption = millisecondsToDays(
        getDateMilliseconds(bond.repaymentDate) - todayMilliseconds
      );
    else bond.repaymentDate = null;
    bond.finalDate = bond.repaymentDate;
    bond.putOffer = false;
    if (Bonds.isDateValid(bond.buyBackDate)) {
      bond.finalDate = bond.buyBackDate;
      bond.putOffer = true;
    } else bond.buyBackDate = null;
    let finalDateMilliseconds;
    if (bond.finalDate) {
      finalDateMilliseconds = getDateMilliseconds(bond.finalDate);
      bond.daysTillRepayment = millisecondsToDays(
        finalDateMilliseconds - todayMilliseconds
      );
      bond.yearsTillRepayment = bond.daysTillRepayment / 365;
    }
    let purchaseDateMilliseconds;
    if (bond.purchaseDate)
      purchaseDateMilliseconds = getDateMilliseconds(bond.purchaseDate);
    const isRedeemed = Bonds.isRedeemed(bond);
    let couponDateMilliseconds;
    if (Bonds.isDateValid(bond.couponDate)) {
      couponDateMilliseconds = getDateMilliseconds(bond.couponDate);
      bond.daysTillCoupon = millisecondsToDays(
        couponDateMilliseconds - todayMilliseconds
      );
    }
    if (bond.relativePrice) {
      bond.currentCost = (bond.lotValue / 100) * bond.relativePrice;
      bond.baseDiff = bond.lotValue - bond.currentCost;
      bond.baseDiffPercent = (bond.baseDiff / bond.lotValue) * 100;
    }
    if (bond.rate) {
      bond.dayRevenue = bond.couponValue / bond.couponPeriod;
      if (Bonds.isSet(bond.baseDiff) && bond.dayRevenue)
        bond.baseDiffInDays = Math.round(bond.baseDiff / bond.dayRevenue);
    } else bond.dayRevenue = 0;
    bond.nkdForAmount = bond.nkd * bond.amount;
    if (bond.couponValue) bond.nkdPercent = (bond.nkd / bond.couponValue) * 100;
    if (isRedeemed) bond.nkdPercent = 0;
    bond.currentCostWithNkd = bond.currentCost + bond.nkd;
    if (bond.durationInDays) {
      bond.duration = bond.durationInDays / 365;
      bond.durationModified = bond.duration / (1 + bond.ytm / 100);
      bond.pvbp =
        (bond.durationModified / 100) * (bond.currentCostWithNkd / 100);
    }
    const taxYear = 2021;
    const taxYearMilliseconds = getDateMilliseconds(taxYear + "-01-01");
    bond.taxYearSplit = false;
    if (
      purchaseDateMilliseconds &&
      bond.ndflFree &&
      purchaseDateMilliseconds < taxYearMilliseconds
    )
      bond.taxYearSplit = true;

    let futureCoupons = 0;
    let futureAmortizations = 0;
    let allCouponsBeforeTaxYear = 0;
    let allBaseCouponsAfter = 0;
    let allBaseCoupons = 0;
    let baseCouponsAfter = 0;
    let baseCoupons = 0;
    if (bond.couponsList) {
      bond.outputCoupons = [];
      bond.couponPaymentCountBefore = 0;
      bond.couponPaymentCountAfter = 0;
      bond.couponPaymentCount = 0;
      for (let i = 0; i < bond.couponsList.length; i++) {
        const current = bond.couponsList[i];
        const currentDateMilliseconds = getDateMilliseconds(current.date);

        const outputCoupon = {
          date: current.date,
          rate: current.rate,
        };
        if (bond.offers && bond.offers[current.date]) {
          outputCoupon.offer = true;
          outputCoupon.offerPercent = bond.offers[current.date].price;
        }
        if (bond.amortizations) {
          if (bond.amortizations[current.date]) {
            outputCoupon.amortization =
              bond.amortizations[current.date].percent;
            if (currentDateMilliseconds > todayMilliseconds)
              futureAmortizations += bond.amortizations[current.date].value;
          }
        } else {
          if (i === bond.couponsList.length - 1)
            outputCoupon.amortization = 100;
        }
        bond.outputCoupons.push(outputCoupon);

        if (purchaseDateMilliseconds) {
          if (bond.taxYearSplit) {
            if (
              currentDateMilliseconds > purchaseDateMilliseconds &&
              currentDateMilliseconds < taxYearMilliseconds
            ) {
              allCouponsBeforeTaxYear += current.value;
              bond.couponPaymentCountBefore++;
            }
            if (
              currentDateMilliseconds > purchaseDateMilliseconds &&
              currentDateMilliseconds >= taxYearMilliseconds
            )
              allBaseCouponsAfter += current.value;
            if (
              currentDateMilliseconds > purchaseDateMilliseconds &&
              currentDateMilliseconds >= taxYearMilliseconds &&
              currentDateMilliseconds <= todayMilliseconds
            ) {
              baseCouponsAfter += current.value;
              bond.couponPaymentCountAfter++;
            }
          } else {
            if (currentDateMilliseconds > purchaseDateMilliseconds)
              allBaseCoupons += current.value;
            if (
              currentDateMilliseconds > purchaseDateMilliseconds &&
              currentDateMilliseconds <= todayMilliseconds
            ) {
              baseCoupons += current.value;
              bond.couponPaymentCount++;
            }
          }
        } else {
          if (currentDateMilliseconds > todayMilliseconds)
            futureCoupons += current.value;
        }
      }
    }

    if (bond.purchasePercent) {
      bond.dayRevenueForAmount = bond.dayRevenue * bond.amount;
      bond.purchaseCost = (bond.lotValue / 100) * bond.purchasePercent;
      bond.purchaseCostForAmount = bond.purchaseCost * bond.amount;
      bond.feeForPurchase = calculateFee(bond.purchaseCostForAmount);
      if (bond.dayRevenueForAmount)
        bond.feeForPurchaseInDays = getDiffInDays(-bond.feeForPurchase);
      // bond.feeForPurchaseInDays = Math.round(-bond.feeForPurchase / ndfl(bond.dayRevenueForAmount));

      if (bond.taxYearSplit) {
        bond.daysOwnAfter =
          millisecondsToDays(todayMilliseconds - taxYearMilliseconds) + 1;
        if (bond.daysOwnAfter < 0) bond.daysOwnAfter = 0;
        bond.allDaysTillEndAfter =
          millisecondsToDays(finalDateMilliseconds - taxYearMilliseconds) + 1;
      }
      bond.daysOwn =
        millisecondsToDays(todayMilliseconds - purchaseDateMilliseconds) + 1;
      if (bond.daysOwn < 0) bond.daysOwn = 0;
      if (Bonds.isSet(bond.currentCost)) {
        bond.currentCostForAmount = bond.currentCost * bond.amount;
        bond.feeForSale = calculateFee(bond.currentCostForAmount);
        if (bond.dayRevenueForAmount)
          bond.feeForSaleInDays = getDiffInDays(-bond.feeForSale);
        // bond.feeForSaleInDays = Math.round(-bond.feeForSale / ndfl(bond.dayRevenueForAmount));
        bond.costDiff = bond.currentCostForAmount - bond.purchaseCostForAmount;
      }
      bond.baseCostDiff =
        bond.lotValue * bond.amount - bond.purchaseCostForAmount;
      bond.baseCostDiffInDays = getDiffInDays(bond.baseCostDiff);
      bond.onePercentChangeInDays = getDiffInDays(
        bond.lotValue * 0.01 * bond.amount
      );
      bond.zeroOnePercentChangeInDays = getDiffInDays(
        bond.lotValue * 0.001 * bond.amount
      );

      let daysSum;
      if (!isRedeemed) {
        daysSum = bond.daysOwn + bond.daysTillCoupon;
        bond.daysTillPurchaseInCouponPeriod =
          (((bond.couponPeriod -
            (daysSum -
              bond.couponPeriod * Math.trunc(daysSum / bond.couponPeriod))) %
            bond.couponPeriod) +
            1) %
          bond.couponPeriod;
        if (Bonds.isSet(bond.userNkd)) bond.buyNkd = bond.userNkd;
        else
          bond.buyNkd = parseFloat(
            (
              bond.daysTillPurchaseInCouponPeriod * bond.dayRevenueForAmount
            ).toFixed(2)
          );
        bond.buyNkdInDays = getDiffInDays(bond.buyNkd);
        bond.purchaseCostWithNkd = bond.purchaseCostForAmount + bond.buyNkd;
        if (bond.couponValue) {
          bond.couponPayment = bond.couponValue * bond.amount;
          bond.buyNkdPercent = (bond.buyNkd / bond.couponPayment) * 100;
        }
        bond.nkdDelta = bond.nkdForAmount - bond.buyNkd;
        bond.nkdDeltaInDays = getDiffInDays(bond.nkdDelta);
        if (bond.buyNkd === 0) {
          bond.sellPeriod = bond.couponPeriod;
          bond.waitPeriod = 0;
          bond.currentSellPeriod = bond.couponPeriod;
        } else {
          bond.sellPeriod =
            bond.couponPeriod - bond.daysTillPurchaseInCouponPeriod;
          bond.waitPeriod = bond.couponPeriod - bond.sellPeriod;
          if (bond.nkdDeltaInDays >= 0)
            bond.currentSellPeriod = bond.daysTillCoupon - 2;
          else bond.currentWaitPeriod = Math.abs(bond.nkdDeltaInDays);
        }
      } else {
        bond.buyNkd = 0;
        bond.buyNkdPercent = 0;
        bond.purchaseCostWithNkd = bond.purchaseCostForAmount;
      }
      bond.buyNkdWithDays = "";

      let allDaysTillEnd;
      const fullPurchaseCost = bond.purchaseCostWithNkd + bond.feeForPurchase;
      const fullPurchaseSaleCost = fullPurchaseCost + bond.feeForSale;
      if (Bonds.isSet(finalDateMilliseconds) && bond.dayRevenueForAmount) {
        allDaysTillEnd =
          millisecondsToDays(finalDateMilliseconds - purchaseDateMilliseconds) +
          1;
        if (bond.taxYearSplit) {
          bond.allCouponsBefore = allCouponsBeforeTaxYear * bond.amount;
          bond.allCouponsAfter = ndfl(allBaseCouponsAfter * bond.amount);
          bond.allCouponsBeforeInDays = getDiffInDays(bond.allCouponsBefore);
          bond.allCouponsAfterInDays = getDiffInDays(
            bond.allCouponsAfter,
            true
          );
          bond.allCoupons = bond.allCouponsBefore + bond.allCouponsAfter;
          bond.allCouponsInDays =
            bond.allCouponsBeforeInDays + bond.allCouponsAfterInDays;
        } else {
          bond.allCoupons = ndfl(allBaseCoupons * bond.amount);
          bond.allCouponsInDays = getDiffInDays(bond.allCoupons, true);
        }
        bond.repaymentNob = bond.lotValue * bond.amount - fullPurchaseCost;
        bond.repaymentNobInDays = getDiffInDays(bond.repaymentNob);
        bond.guaranteedTradeRevenue = ndfl(bond.repaymentNob);
        if (bond.dayRevenueForAmount) {
          if (bond.taxYearSplit && bond.allCouponPaymentCountBefore)
            bond.guaranteedTradeRevenueInDays = getDiffInDaysNdfl(
              bond.guaranteedTradeRevenue,
              true
            );
          else
            bond.guaranteedTradeRevenueInDays = getDiffInDays(
              bond.guaranteedTradeRevenue,
              true
            );
        }
        bond.guaranteedRevenueByRepayment =
          bond.guaranteedTradeRevenue + bond.allCoupons;
        bond.guaranteedRevenueByRepaymentInDays =
          bond.guaranteedTradeRevenueInDays + bond.allCouponsInDays;
        bond.guaranteedRevenueByRepaymentPercent =
          (bond.guaranteedRevenueByRepayment / fullPurchaseCost) * 100;
        bond.revenueByRepaymentPercent =
          (bond.guaranteedRevenueByRepaymentPercent / allDaysTillEnd) * 365;
      }
      if (Bonds.isSet(bond.currentCost) && bond.dayRevenue)
        bond.purchaseDiffInDays = getDiffInDays(bond.costDiff);
      if (!isRedeemed) {
        if (bond.taxYearSplit) {
          bond.couponsBefore = allCouponsBeforeTaxYear * bond.amount;
          bond.couponsAfter = ndfl(baseCouponsAfter * bond.amount);
          bond.couponsBeforeInDays = getDiffInDays(bond.couponsBefore);
          bond.couponsAfterInDays = getDiffInDays(bond.couponsAfter, true);
          bond.coupons = bond.couponsBefore + bond.couponsAfter;
          bond.couponsInDays =
            bond.couponsBeforeInDays + bond.couponsAfterInDays;
        } else {
          bond.coupons = ndfl(baseCoupons * bond.amount);
          bond.couponsInDays = getDiffInDays(bond.coupons, true);
        }
      }

      if (Bonds.isSet(bond.costDiff)) {
        bond.nob =
          bond.costDiff +
          bond.nkdForAmount -
          bond.buyNkd -
          bond.feeForPurchase -
          bond.feeForSale;
        const nobForRealRate =
          bond.nkdForAmount - bond.buyNkd - bond.feeForPurchase * 2;
        bond.tradeRevenue = ndfl(bond.nob);
        let currentRevenueForRealRate = ndfl(nobForRealRate);
        if (bond.dayRevenueForAmount) {
          bond.nobInDays = getDiffInDays(bond.nob);
          if (bond.taxYearSplit && bond.couponsBefore)
            bond.tradeRevenueInDays = getDiffInDaysNdfl(
              bond.tradeRevenue,
              true
            );
          else bond.tradeRevenueInDays = getDiffInDays(bond.tradeRevenue, true);
        }
        bond.currentRevenue = bond.tradeRevenue;
        if (Bonds.isSet(bond.coupons)) {
          bond.currentRevenue += bond.coupons;
          currentRevenueForRealRate += bond.coupons;
        }
        if (bond.dayRevenueForAmount) {
          bond.calculatedDaysOwn = bond.tradeRevenueInDays + bond.couponsInDays;
          bond.calculatedDaysOwnDiff = bond.calculatedDaysOwn - bond.daysOwn;
        }
        bond.currentRevenuePercent =
          (bond.currentRevenue / fullPurchaseSaleCost) * 100;
        if (bond.daysOwn > 0) {
          bond.currentYearRevenuePercent =
            (bond.currentRevenuePercent / bond.daysOwn) * 365;
          bond.realRate =
            (((currentRevenueForRealRate /
              (bond.purchaseCostWithNkd + bond.feeForPurchase * 2)) *
              100) /
              bond.daysOwn) *
            365;
        }
        if (
          Bonds.isSet(finalDateMilliseconds) &&
          Bonds.isSet(bond.guaranteedRevenueByRepayment)
        ) {
          bond.guaranteedRevenueDiff =
            bond.guaranteedRevenueByRepayment - bond.currentRevenue;
          bond.remainRepaymentRate =
            (((bond.guaranteedRevenueDiff / bond.daysTillRepayment) * 365) /
              fullPurchaseCost) *
            100;
          bond.guaranteedRevenueDiffPercent =
            (bond.guaranteedRevenueDiff / fullPurchaseSaleCost) * 100;
          if (bond.dayRevenueForAmount)
            bond.guaranteedRevenueDiffInDays = getDiffInDays(
              bond.guaranteedRevenueDiff,
              true
            );
          if (bond.guaranteedRevenueDiff < 0) {
            bond.sellNow = true;
            bond.sellNowValue = "";
          }
        }
      }
      if (Bonds.isSet(bond.baseDiff))
        bond.baseDiffForAmount = bond.baseDiff * bond.amount;

      if (bond.dayRevenueForAmount)
        bond.dayRevenueForAmount = ndfl(bond.dayRevenueForAmount);
      if (bond.couponPayment) {
        if (bond.taxYearSplit) {
          bond.couponPaymentBefore = bond.couponPayment;
          bond.couponPaymentAfter = ndfl(bond.couponPayment);
        }
        bond.couponPayment = ndfl(bond.couponPayment);
      }

      convertEmptyToNegInfinity([
        "dayRevenueForAmount",
        "currentCostForAmount",
        "baseDiffForAmount",
        "feeForSale",
        "costDiff",
        "couponEarnings",
        "currentRevenue",
        "currentRevenuePercent",
        "currentYearRevenuePercent",
        "purchaseDiffInDays",
        "guaranteedRevenueByRepayment",
        "guaranteedRevenueByRepaymentPercent",
        "guaranteedRevenueDiff",
        "guaranteedRevenueDiffInDays",
        "revenueByRepaymentPercent",
        "couponPayment",
        "currentSellPeriod",
        "currentWaitPeriod",
      ]);
    } else {
      if (bond.currentCost && bond.daysTillRepayment && bond.dayRevenue) {
        const fee = calculateFee(bond.currentCost);
        const days = bond.daysTillRepayment - 1;
        const coupons = ndfl(days * bond.dayRevenue);
        bond.revenueByRepaymentPercent =
          ((((ndfl(bond.lotValue - bond.currentCost - fee) + coupons) /
            (bond.currentCostWithNkd + fee)) *
            100) /
            days) *
          365;

        if (Bonds.isSet(realRatePeriod))
          realRatePeriod = parseInt(realRatePeriod);
        else realRatePeriod = 0;
        let daysPeriod = realRatePeriod * 30;
        let coeff = 1;
        if (!daysPeriod || daysPeriod > bond.daysTillRepayment - 1) {
          daysPeriod = bond.daysTillRepayment - 1;
          coeff = 2;
        }
        bond.realRate =
          ((((-fee * coeff + ndfl(daysPeriod * bond.dayRevenue)) /
            (bond.currentCostWithNkd + fee * coeff)) *
            100) /
            daysPeriod) *
          365;
        bond.rateToBaseDiffInDays =
          (bond.realRate / (1000 - bond.baseDiffInDays)) * 1000;
        bond.currentYieldNN = (bond.rate / bond.relativePrice) * 100;
        bond.currentYield = (ndfl(bond.rate) / bond.relativePrice) * 100;
        bond.currentYieldModifiedNN =
          bond.currentYieldNN +
          (100 - bond.relativePrice) / (bond.daysTillRepayment / 365);
        bond.currentYieldModified =
          bond.currentYield +
          ndfl(100 - bond.relativePrice) / (bond.daysTillRepayment / 365);
        const couponsPerYear = Math.round(364 / bond.couponPeriod);
        bond.nomYield =
          (Math.pow(bond.ytm / 100 + 1, 1 / couponsPerYear) - 1) *
          couponsPerYear *
          100;

        if (bond.couponsList) {
          let N;
          if (bond.amortizations) N = futureAmortizations;
          else N = bond.lotValue;
          bond.simpleYieldNN =
            ((futureCoupons + N - bond.currentCostWithNkd) /
              bond.currentCostWithNkd /
              bond.daysTillRepayment) *
            365 *
            100;
          bond.simpleYield =
            ((ndfl(futureCoupons) + ndfl(N - bond.currentCostWithNkd - fee)) /
              (bond.currentCostWithNkd + fee) /
              bond.daysTillRepayment) *
            365 *
            100;
        } // иначе можно использовать показывать bond.revenueByRepaymentPercent
      }

      if (bond.nkdPercent === 0) {
        bond.sellPeriod = bond.couponPeriod;
        bond.waitPeriod = 0;
      } else {
        bond.sellPeriod = bond.daysTillCoupon - 1;
        bond.waitPeriod = bond.couponPeriod - bond.sellPeriod;
      }
    }
    bond.nkdPeriod = "";
    bond.lowHighPrice = "";
    if (bond.totalBid && bond.totalOffer)
      bond.bidOfferRatio = bond.totalBid / bond.totalOffer;

    convertEmptyToNegInfinity([
      "currentPercent",
      "revenueByRepaymentPercent",
      "baseDiffInDays",
      "daysTillCoupon",
      "currentCost",
      "baseDiff",
      "baseDiffPercent",
      "dayRevenue",
      "daysTillRedemption",
      "daysTillRepayment",
      "bidOfferRatio",
      "nkdPercent",
      "rateToBaseDiffInDays",
    ]);

    // --- Вроде как не используется ---
    // data.potentialRevenueByRepayment = data.dayRevenue * data.daysTillRepayment;
    // data.potentialRevenueByRepaymentForAmount = data.potentialRevenueByRepayment * data.amount;

    // data.guaranteedRevenueByRepayment = data.potentialRevenueByRepayment - data.baseDiff;
    // data.guaranteedRevenueByRepaymentForAmount = data.guaranteedRevenueByRepayment * data.amount;

    function millisecondsToDays(milliseconds) {
      return Math.round(milliseconds / 1000 / 60 / 60 / 24);
    }

    function getTodayMilliseconds() {
      const now = new Date();
      return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function getDateMilliseconds(dateString) {
      return Date.parse(dateString);
    }

    function calculateFee(value) {
      const fees = Bonds.getFees();
      if (fees) {
        let { fee, minFee } = fees;
        fee = parseFloat(fee) / 100;
        let result = value * fee;
        minFee = parseFloat(minFee);
        if (result < minFee) result = minFee;
        return result;
      } else return 0;
    }

    function ndfl(value) {
      if (value > 0) {
        let coef;
        if (Bonds.isRus()) coef = 0.87;
        else coef = 0.7;
        return value * coef;
      } else return value;
    }

    function convertEmptyToNegInfinity(fields) {
      fields.forEach((field) => {
        if (!Bonds.isSet(bond[field])) bond[field] = Number.NEGATIVE_INFINITY;
      });
    }

    function getDiffInDays(value, withNdfl) {
      if (!withNdfl) withNdfl = false;
      return Math.round(
        value /
          (withNdfl ? ndfl(bond.dayRevenueForAmount) : bond.dayRevenueForAmount)
      );
    }

    function getDiffInDaysNdfl(value, withNdfl) {
      if (!withNdfl) withNdfl = false;
      return Math.round(
        value /
          (withNdfl && value > 0
            ? ndfl(bond.dayRevenueForAmount)
            : bond.dayRevenueForAmount)
      );
    }

    return bond;
  },

  mapColumnsToValues: function (json, name) {
    return json[name].data.map((bondInfo) => {
      let result = {};
      const columns = json[name].columns;
      columns.forEach((value, index) => (result[value] = bondInfo[index]));
      return result;
    });
  },

  composeBondInfo: function (json) {
    const bonds = Bonds.mapColumnsToValues(json, "securities");
    const markets = Bonds.mapColumnsToValues(json, "marketdata");
    return bonds.map((bond, index) => {
      return Bonds.filterMoexData({
        bond: bond,
        market: markets[index],
      });
    });
  },

  mapCandles: function (json, intraday) {
    const candles = Bonds.mapColumnsToValues(json, "candles");
    return {
      candles: candles.map((candle) => {
        return Bonds.filterMoexCandles(candle, intraday);
      }),
      volume: candles.map((candle) => {
        return Bonds.filterMoexVolume(candle, intraday);
      }),
    };
  },

  getUnixTimestamp: function (date) {
    date += " UTC";
    return new Date(date).getTime() / 1000;
  },

  filterMoexCandles: function (moex, intraday) {
    const series = {};
    if (intraday) series.time = Bonds.getUnixTimestamp(moex.begin);
    else series.time = moex.begin.split(" ")[0];
    series.open = moex.open;
    series.close = moex.close;
    series.high = moex.high;
    series.low = moex.low;
    return series;
  },

  filterMoexVolume: function (moex, intraday) {
    const series = {};
    if (intraday) series.time = Bonds.getUnixTimestamp(moex.begin);
    else series.time = moex.begin.split(" ")[0];
    series.value = moex.volume;
    return series;
  },

  filterMoexData: function (moex) {
    const parse = (value, func) => (Bonds.isSet(value) ? func(value) : value);
    const toInt = (value) => parse(value, parseInt);
    const toFloat = (value) => parse(value, parseFloat);

    let bond = {};
    bond.code = moex.bond.SECID;
    bond.board = moex.bond.BOARDID;
    bond.currentPercent =
      toFloat(moex.market.LAST) || toFloat(moex.bond.PREVPRICE);
    bond.name = moex.bond.SHORTNAME;
    bond.fullName = moex.bond.SECNAME;
    bond.engName = moex.bond.LATNAME;
    bond.rate = toFloat(moex.bond.COUPONPERCENT);
    bond.repaymentDate = moex.bond.MATDATE;
    bond.buyBackDate = moex.bond.BUYBACKDATE;
    bond.buyBackPrice = toFloat(moex.bond.BUYBACKPRICE);
    bond.couponDate = moex.bond.NEXTCOUPON;
    bond.couponPeriod = toInt(moex.bond.COUPONPERIOD);
    bond.isin = moex.bond.ISIN;
    bond.nkd = toFloat(moex.bond.ACCRUEDINT);
    bond.couponValue = toFloat(moex.bond.COUPONVALUE);
    bond.bid = toFloat(moex.market.BID);
    bond.offer = toFloat(moex.market.OFFER);
    bond.sector = toInt(moex.bond.SECTYPE);
    bond.listing = toInt(moex.bond.LISTLEVEL);
    bond.totalBid = toInt(moex.market.BIDDEPTHT);
    bond.totalOffer = toInt(moex.market.OFFERDEPTHT);
    bond.priceChange = toFloat(moex.market.LASTCHANGEPRCNT);
    bond.prevDayPriceChange = toFloat(moex.market.LASTCNGTOLASTWAPRICE);
    bond.tradeCount = toInt(moex.market.NUMTRADES);
    bond.totalTradeVolume = toInt(moex.market.VOLTODAY);
    bond.lastTradeVolume = toInt(moex.market.QTY);
    if (bond.tradeCount > 0) bond.lastTradeTime = moex.market.TIME;
    else bond.lastTradeTime = null;
    bond.openPrice = toFloat(moex.market.OPEN);
    bond.lowPrice = toFloat(moex.market.LOW);
    bond.highPrice = toFloat(moex.market.HIGH);
    bond.spread = toFloat(moex.market.SPREAD);
    bond.lotValue = toFloat(moex.bond.LOTVALUE);
    bond.averagePrice = toFloat(moex.market.WAPRICE);
    bond.prevDayAveragePriceChange = toFloat(moex.market.WAPTOPREVWAPRICE);
    bond.currency = moex.bond.FACEUNIT;
    bond.ytm = toFloat(moex.market.YIELD);
    bond.durationInDays = toInt(moex.market.DURATION);
    return bond;
  },

  filterCouponsData: function (moexList) {
    let coupons = [];
    for (let i = 0; i < moexList.length; i++) {
      const moexItem = moexList[i];
      const coupon = {
        date: moexItem.coupondate,
        value: moexItem.value,
        rate: moexItem.valueprc,
      };
      coupons.push(coupon);
    }
    return coupons;
  },

  filterAmortizationData: function (moexList) {
    let amortizations = {};
    for (let i = 0; i < moexList.length; i++) {
      const moexItem = moexList[i];
      if (moexItem.data_source === "amortization") {
        const amortization = {
          date: moexItem.amortdate,
          value: moexItem.value,
          percent: moexItem.valueprc,
        };
        amortizations[moexItem.amortdate] = amortization;
      }
    }
    return amortizations;
  },

  filterOfferData: function (moexList) {
    let offers = {};
    for (let i = 0; i < moexList.length; i++) {
      const moexItem = moexList[i];
      const offer = {
        price: moexItem.price,
      };
      offers[moexItem.offerdateend] = offer;
    }
    return offers;
  },

  deleteRedeemedBonds: function (bond, bonds) {
    const repaymentDateSeconds = new Date(bond.repaymentDate).getTime();
    return bonds.filter((currentBond) => {
      if (
        bond.code === currentBond.code &&
        Bonds.isSet(repaymentDateSeconds) &&
        Date.now() > repaymentDateSeconds
      )
        return false;
      else return true;
    });
  },

  fillBonds: async function (storage, dispatch) {
    let bonds = Bonds.getStorageBonds(storage);
    const clearOnError = (error, bond) => {
      const pattern = new RegExp(bond.code);
      if (pattern.test(error.message)) {
        if (Bonds.isSet(bond.repaymentDate)) {
          const newBonds = Bonds.deleteRedeemedBonds(bond, bonds);
          Bonds.updateStorageBonds(newBonds, storage);
        }
      }
    };
    const clearUndefined = (bonds) => bonds.filter((bond) => Bonds.isSet(bond));

    if (bonds && bonds.length) {
      const promises = bonds.map((bond) =>
        Bonds.updateBond(bond).catch((error) => clearOnError(error, bond))
      );
      return Promise.all(promises).then((values) => {
        values = clearUndefined(values);
        // console.log(values);
        dispatch({ type: "saveAllBonds", allBonds: values });
        return values;
      });
    } else return [];
  },

  sortItems: function (items, sorting) {
    return items.sort(Bonds[sorting].bind(Bonds));
  },

  sort: function (a, b, value, direction) {
    let x, y;
    switch (direction) {
      case "asc":
        x = a;
        y = b;
        break;
      case "desc":
        x = b;
        y = a;
        break;
      default:
        break;
    }
    if (x[value] < y[value]) return -1;
    if (x[value] > y[value]) return 1;
    return 0;
  },

  sortByRateDesc: function (a, b) {
    return this.sort(a, b, "rate", "desc");
  },

  sortByRateAsc: function (a, b) {
    return this.sort(a, b, "rate", "asc");
  },

  sortByRevenueDesc: function (a, b) {
    return this.sort(a, b, "revenueByRepaymentPercent", "desc");
  },

  sortByRevenueAsc: function (a, b) {
    return this.sort(a, b, "revenueByRepaymentPercent", "asc");
  },

  sortByPriceDesc: function (a, b) {
    return this.sort(a, b, "currentPercent", "desc");
  },

  sortByPriceAsc: function (a, b) {
    return this.sort(a, b, "currentPercent", "asc");
  },

  sortByBaseDiffInDaysDesc: function (a, b) {
    return this.sort(a, b, "baseDiffInDays", "desc");
  },

  sortByBaseDiffInDaysAsc: function (a, b) {
    return this.sort(a, b, "baseDiffInDays", "asc");
  },

  sortByDaysTillRepaymentDesc: function (a, b) {
    return this.sort(a, b, "daysTillRepayment", "desc");
  },

  sortByDaysTillRepaymentAsc: function (a, b) {
    return this.sort(a, b, "daysTillRepayment", "asc");
  },

  sortDaysTillCouponDesc: function (a, b) {
    return this.sort(a, b, "daysTillCoupon", "desc");
  },

  sortDaysTillCouponAsc: function (a, b) {
    return this.sort(a, b, "daysTillCoupon", "asc");
  },

  sortByCurrentYearRevenueDesc: function (a, b) {
    return this.sort(a, b, "currentYearRevenuePercent", "desc");
  },

  sortByCurrentYearRevenueAsc: function (a, b) {
    return this.sort(a, b, "currentYearRevenuePercent", "asc");
  },

  sortByCurrentRevenueDesc: function (a, b) {
    return this.sort(a, b, "currentRevenuePercent", "desc");
  },

  sortByCurrentRevenueAsc: function (a, b) {
    return this.sort(a, b, "currentRevenuePercent", "asc");
  },

  sortByPurchasePercentDesc: function (a, b) {
    return this.sort(a, b, "purchasePercent", "desc");
  },

  sortByPurchasePercentAsc: function (a, b) {
    return this.sort(a, b, "purchasePercent", "asc");
  },

  sortByAmountDesc: function (a, b) {
    return this.sort(a, b, "amount", "desc");
  },

  sortByAmountAsc: function (a, b) {
    return this.sort(a, b, "amount", "asc");
  },

  sortByBidDesc: function (a, b) {
    return this.sort(a, b, "bid", "desc");
  },

  sortByBidAsc: function (a, b) {
    return this.sort(a, b, "bid", "asc");
  },

  sortByOfferDesc: function (a, b) {
    return this.sort(a, b, "offer", "desc");
  },

  sortByOfferAsc: function (a, b) {
    return this.sort(a, b, "offer", "asc");
  },

  sortByTotalBidDesc: function (a, b) {
    return this.sort(a, b, "totalBid", "desc");
  },

  sortByTotalBidAsc: function (a, b) {
    return this.sort(a, b, "totalBid", "asc");
  },

  sortByTotalOfferDesc: function (a, b) {
    return this.sort(a, b, "totalOffer", "desc");
  },

  sortByTotalOfferAsc: function (a, b) {
    return this.sort(a, b, "totalOffer", "asc");
  },

  sortByBidOfferRatioDesc: function (a, b) {
    return this.sort(a, b, "bidOfferRatio", "desc");
  },

  sortByBidOfferRatioAsc: function (a, b) {
    return this.sort(a, b, "bidOfferRatio", "asc");
  },

  sortByPriceChangeDesc: function (a, b) {
    return this.sort(a, b, "priceChange", "desc");
  },

  sortByPriceChangeAsc: function (a, b) {
    return this.sort(a, b, "priceChange", "asc");
  },

  sortByPrevDayPriceChangeDesc: function (a, b) {
    return this.sort(a, b, "prevDayPriceChange", "desc");
  },

  sortByPrevDayPriceChangeAsc: function (a, b) {
    return this.sort(a, b, "prevDayPriceChange", "asc");
  },

  sortByTradeCountDesc: function (a, b) {
    return this.sort(a, b, "tradeCount", "desc");
  },

  sortByTradeCountAsc: function (a, b) {
    return this.sort(a, b, "tradeCount", "asc");
  },

  sortByTotalTradeVolumeDesc: function (a, b) {
    return this.sort(a, b, "totalTradeVolume", "desc");
  },

  sortByTotalTradeVolumeAsc: function (a, b) {
    return this.sort(a, b, "totalTradeVolume", "asc");
  },

  sortByLastTradeVolumeDesc: function (a, b) {
    return this.sort(a, b, "lastTradeVolume", "desc");
  },

  sortByLastTradeVolumeAsc: function (a, b) {
    return this.sort(a, b, "lastTradeVolume", "asc");
  },

  sortByOpenPriceDesc: function (a, b) {
    return this.sort(a, b, "openPrice", "desc");
  },

  sortByOpenPriceAsc: function (a, b) {
    return this.sort(a, b, "openPrice", "asc");
  },

  sortByLowPriceDesc: function (a, b) {
    return this.sort(a, b, "lowPrice", "desc");
  },

  sortByLowPriceAsc: function (a, b) {
    return this.sort(a, b, "lowPrice", "asc");
  },

  sortByHighPriceDesc: function (a, b) {
    return this.sort(a, b, "highPrice", "desc");
  },

  sortByHighPriceAsc: function (a, b) {
    return this.sort(a, b, "highPrice", "asc");
  },

  sortBySpreadDesc: function (a, b) {
    return this.sort(a, b, "spread", "desc");
  },

  sortBySpreadAsc: function (a, b) {
    return this.sort(a, b, "spread", "asc");
  },

  sortByLotValueDesc: function (a, b) {
    return this.sort(a, b, "lotValue", "desc");
  },

  sortByLotValueAsc: function (a, b) {
    return this.sort(a, b, "lotValue", "asc");
  },

  sortByAveragePriceDesc: function (a, b) {
    return this.sort(a, b, "averagePrice", "desc");
  },

  sortByAveragePriceAsc: function (a, b) {
    return this.sort(a, b, "averagePrice", "asc");
  },

  sortByPrevDayAveragePriceChangeDesc: function (a, b) {
    return this.sort(a, b, "prevDayAveragePriceChange", "desc");
  },

  sortByPrevDayAveragePriceChangeAsc: function (a, b) {
    return this.sort(a, b, "prevDayAveragePriceChange", "asc");
  },

  sortByNkdPercentDesc: function (a, b) {
    return this.sort(a, b, "nkdPercent", "desc");
  },

  sortByNkdPercentAsc: function (a, b) {
    return this.sort(a, b, "nkdPercent", "asc");
  },

  sortByCalculatedDaysOwnDiffDesc: function (a, b) {
    return this.sort(a, b, "calculatedDaysOwnDiff", "desc");
  },

  sortByCalculatedDaysOwnDiffAsc: function (a, b) {
    return this.sort(a, b, "calculatedDaysOwnDiff", "asc");
  },

  sortByRateToBaseDiffInDaysDesc: function (a, b) {
    return this.sort(a, b, "rateToBaseDiffInDays", "desc");
  },

  sortByRateToBaseDiffInDaysAsc: function (a, b) {
    return this.sort(a, b, "rateToBaseDiffInDays", "asc");
  },

  sortByCurrentSellPeriodDesc: function (a, b) {
    return this.sort(a, b, "currentSellPeriod", "desc");
  },

  sortByCurrentSellPeriodAsc: function (a, b) {
    return this.sort(a, b, "currentSellPeriod", "asc");
  },

  sortByCurrentWaitPeriodDesc: function (a, b) {
    return this.sort(a, b, "currentWaitPeriod", "desc");
  },

  sortByCurrentWaitPeriodAsc: function (a, b) {
    return this.sort(a, b, "currentWaitPeriod", "asc");
  },

  sortByBuyNkdPercentDesc: function (a, b) {
    return this.sort(a, b, "buyNkdPercent", "desc");
  },

  sortByBuyNkdPercentAsc: function (a, b) {
    return this.sort(a, b, "buyNkdPercent", "asc");
  },

  sortByRealRateDesc: function (a, b) {
    return this.sort(a, b, "realRate", "desc");
  },

  sortByRealRateAsc: function (a, b) {
    return this.sort(a, b, "realRate", "asc");
  },

  sortByRemainRepaymentRateDesc: function (a, b) {
    return this.sort(a, b, "remainRepaymentRate", "desc");
  },

  sortByRemainRepaymentRateAsc: function (a, b) {
    return this.sort(a, b, "remainRepaymentRate", "asc");
  },

  confirmDelete: (t) => window.confirm(t("Alerts.delete")),

  isDateValid: (dateString) =>
    Bonds.isSet(dateString) && dateString !== "0000-00-00",

  isRedeemed: (bond) => bond.daysTillRepayment <= 0,

  prepareDisplayData: (bond, t, card) => {
    const percent = "%";
    const days = " " + t("Endings.days");
    const years = " " + t("Endings.years");
    const rub = " " + t("Endings.rub");
    const pieces = " " + t("Endings.pieces");
    const lots = " " + t("Endings.lots");
    // const own = ' ' + t('Endings.own');
    const isRedeemed = Bonds.isRedeemed(bond);

    const round = (number, symbols = 2) => parseFloat(number).toFixed(symbols);
    const addPlus = (value) => (value > 0 ? "+" : "") + value;
    const brackets = (value) => " (" + value + ")";

    const daysToMonth = (days, plus) => {
      if (days) {
        const month = days / 30;
        const roundMonth = round(month, 1);
        return brackets(
          (plus ? addPlus(roundMonth) : roundMonth) + " " + t("Endings.months")
        );
      } else return "";
    };

    const addByValue = (field, fillValue, ifExists, otherField) => {
      const value = bond[field];
      let displayBondField = field;
      if (otherField) displayBondField = otherField;

      if (
        !Bonds.isSet(value) ||
        (!isNaN(parseFloat(value)) && !isFinite(parseFloat(value)))
      ) {
        if (!ifExists) displayBond[displayBondField] = "-";
      } else displayBond[displayBondField] = fillValue;
    };

    const addByField = (field, postfix, ifExists) => {
      let fillValue = bond[field];
      if (postfix) fillValue += postfix;
      addByValue(field, fillValue, ifExists);
    };

    let displayBond = {};
    addByField("name");
    addByValue("finalDate", Bonds.formatDate(bond.finalDate));
    addByValue(
      "daysTillRepayment",
      Bonds.triad(bond.daysTillRepayment) +
        days +
        daysToMonth(bond.daysTillRepayment)
    );
    addByField("purchasePercent", percent, true);
    addByValue("purchaseDate", Bonds.formatDate(bond.purchaseDate), true);
    addByField("rate", percent);
    addByField("amount", pieces, true);
    addByField("bid", percent);
    addByField("offer", percent);
    addByValue(
      "revenueByRepaymentPercent",
      round(bond.revenueByRepaymentPercent) + percent
    );
    addByField("currentPercent", percent);
    addByValue(
      "baseDiffInDays",
      addPlus(bond.baseDiffInDays) +
        days +
        daysToMonth(bond.baseDiffInDays, true)
    );
    addByValue(
      "currentRevenuePercent",
      round(bond.currentRevenuePercent) + percent
    );
    addByValue(
      "currentYearRevenuePercent",
      round(bond.currentYearRevenuePercent) + percent
    );
    addByField("daysTillCoupon", days);
    addByValue(
      "currentRevenue",
      Bonds.triad(round(bond.currentRevenue)) +
        rub +
        brackets(bond.calculatedDaysOwn + days)
    );
    addByValue("totalBid", Bonds.triad(bond.totalBid) + lots);
    addByValue("totalOffer", Bonds.triad(bond.totalOffer) + lots);
    addByValue("bidOfferRatio", round(bond.bidOfferRatio));
    addByValue("priceChange", addPlus(bond.priceChange) + percent);
    addByValue(
      "prevDayPriceChange",
      addPlus(bond.prevDayPriceChange) + percent
    );
    addByValue("tradeCount", Bonds.triad(bond.tradeCount) + pieces);
    addByValue("totalTradeVolume", Bonds.triad(bond.totalTradeVolume) + lots);
    addByValue("lastTradeVolume", Bonds.triad(bond.lastTradeVolume) + lots);
    addByField("lastTradeTime");
    addByField("openPrice", percent);
    addByField("lowPrice", percent);
    addByField("highPrice", percent);
    addByField("spread", percent);
    addByField("lotValue", rub);
    addByField("averagePrice", percent);
    addByValue(
      "prevDayAveragePriceChange",
      addPlus(bond.prevDayAveragePriceChange) + percent
    );
    addByField("code");
    addByValue("listing", t("Filters.listing.level" + bond.listing));
    const nkdPercent = round(bond.nkdPercent, 1) + percent;
    addByValue("nkdPercent", nkdPercent);
    addByValue("nkd", bond.nkd + rub + brackets(nkdPercent));
    addByValue(
      "nkdForAmount",
      addPlus(Bonds.triad(round(bond.nkdForAmount))) +
        rub +
        brackets(addPlus(round(bond.nkdPercent, 1)) + percent)
    );
    addByValue(
      "buyNkd",
      addPlus(Bonds.triad(round(-bond.buyNkd))) +
        rub +
        brackets(addPlus(round(-bond.buyNkdPercent, 1)) + percent)
    );
    addByValue(
      "buyNkdWithDays",
      addPlus(Bonds.triad(round(-bond.buyNkd))) +
        rub +
        brackets(addPlus(-bond.buyNkdInDays) + days)
    );
    addByValue("buyNkdPercent", round(bond.buyNkdPercent) + percent);
    addByValue(
      "calculatedDaysOwnDiff",
      addPlus(bond.calculatedDaysOwnDiff) +
        days +
        daysToMonth(bond.calculatedDaysOwnDiff, true)
    );
    addByValue("rateToBaseDiffInDays", round(bond.rateToBaseDiffInDays));
    addByValue(
      "currentSellPeriod",
      bond.currentSellPeriod + days + daysToMonth(bond.currentSellPeriod)
    );
    addByValue(
      "currentWaitPeriod",
      bond.currentWaitPeriod + days + daysToMonth(bond.currentWaitPeriod)
    );
    addByValue(
      "nkdPeriod",
      bond.sellPeriod + days + " / " + bond.waitPeriod + days
    );
    addByField("sellPeriod", days);
    addByField("waitPeriod", days);
    if (
      Bonds.isSet(bond.lowPrice) &&
      Bonds.isSet(bond.highPrice) &&
      Bonds.isSet(bond.openPrice)
    )
      addByValue(
        "lowHighPrice",
        bond.lowPrice +
          percent +
          " - " +
          bond.highPrice +
          percent +
          brackets(bond.openPrice + percent)
      );
    else addByValue("lowHighPrice", "-");
    addByValue("realRate", round(bond.realRate) + percent);
    addByValue(
      "remainRepaymentRate",
      round(bond.remainRepaymentRate) + percent
    );
    addByValue("currentYield", round(bond.currentYield) + percent);
    addByValue("currentYieldNN", round(bond.currentYieldNN) + percent);
    addByValue(
      "currentYieldModified",
      round(bond.currentYieldModified) + percent
    );
    addByValue(
      "currentYieldModifiedNN",
      round(bond.currentYieldModifiedNN) + percent
    );
    addByField("ytm", percent);
    addByValue("nomYield", round(bond.nomYield) + percent);
    addByValue(
      "duration",
      round(bond.duration) + years + brackets(bond.durationInDays + days)
    );
    addByValue("durationModified", round(bond.durationModified) + years);
    addByValue("pvbp", round(bond.pvbp));
    addByValue("simpleYield", round(bond.simpleYield) + percent);
    addByValue("simpleYieldNN", round(bond.simpleYieldNN) + percent);
    if (card) {
      addByField("fullName");
      addByField("engName");
      addByField("isin");
      addByValue(
        "purchaseCostForAmount",
        Bonds.triad(round(bond.purchaseCostForAmount)) + rub
      );
      addByValue(
        "currentCostForAmount",
        Bonds.triad(round(bond.currentCostForAmount)) + rub
      );
      addByValue(
        "costDiff",
        addPlus(Bonds.triad(round(bond.costDiff))) +
          rub +
          brackets(addPlus(bond.purchaseDiffInDays) + days)
      );
      addByValue("daysOwn", bond.daysOwn + days + daysToMonth(bond.daysOwn));
      addByValue(
        "daysTillRedemption",
        Bonds.triad(bond.daysTillRedemption) +
          days +
          daysToMonth(bond.daysTillRedemption)
      );
      addByValue("repaymentDate", Bonds.formatDate(bond.repaymentDate));
      addByValue("buyBackDate", Bonds.formatDate(bond.buyBackDate));
      addByField("buyBackPrice", percent);
      addByField("couponPeriod", days);
      addByValue("couponDate", Bonds.formatDate(bond.couponDate));
      addByValue("couponPayment", Bonds.triad(round(bond.couponPayment)) + rub);
      addByValue(
        "couponPaymentBefore",
        Bonds.triad(round(bond.couponPaymentBefore)) + rub
      );
      addByValue(
        "couponPaymentAfter",
        Bonds.triad(round(bond.couponPaymentAfter)) + rub
      );
      addByValue(
        "guaranteedRevenueByRepaymentPercent",
        round(bond.guaranteedRevenueByRepaymentPercent) + percent
      );
      addByValue(
        "guaranteedRevenueByRepayment",
        Bonds.triad(round(bond.guaranteedRevenueByRepayment)) +
          rub +
          brackets(bond.guaranteedRevenueByRepaymentInDays + days)
      );
      addByValue(
        "guaranteedRevenueDiff",
        Bonds.triad(round(bond.guaranteedRevenueDiff)) +
          rub +
          brackets(bond.guaranteedRevenueDiffInDays + days)
      );
      addByValue(
        "sellNowValue",
        addPlus(Bonds.triad(round(-bond.guaranteedRevenueDiff))) +
          rub +
          brackets(addPlus(-bond.guaranteedRevenueDiffInDays) + days)
      );
      addByValue(
        "guaranteedRevenueDiffInDays",
        bond.guaranteedRevenueDiffInDays +
          days +
          daysToMonth(bond.guaranteedRevenueDiffInDays)
      );
      addByValue(
        "dayRevenueForAmount",
        Bonds.triad(round(bond.dayRevenueForAmount)) + rub
      );
      addByValue(
        "dayRevenueForAmount",
        Bonds.triad(round(bond.dayRevenueForAmount * 30)) + rub,
        false,
        "monthRevenueForAmount"
      );
      addByValue(
        "dayRevenueForAmount",
        Bonds.triad(round(bond.dayRevenueForAmount * 365)) + rub,
        false,
        "yearRevenueForAmount"
      );
      addByValue(
        "feeForPurchase",
        round(-bond.feeForPurchase) +
          rub +
          brackets(addPlus(bond.feeForPurchaseInDays) + days)
      );
      addByValue(
        "feeForSale",
        addPlus(round(-bond.feeForSale)) +
          rub +
          brackets(addPlus(bond.feeForSaleInDays) + days)
      );
      addByValue(
        "extraRevenuePercent",
        round(bond.extraRevenuePercent) + percent
      );
      addByValue(
        "nob",
        Bonds.triad(round(bond.nob)) + rub + brackets(bond.nobInDays + days)
      );
      addByValue(
        "tradeRevenue",
        addPlus(Bonds.triad(round(bond.tradeRevenue))) +
          rub +
          brackets(addPlus(bond.tradeRevenueInDays) + days)
      );
      addByValue(
        "repaymentNob",
        Bonds.triad(round(bond.repaymentNob)) +
          rub +
          brackets(bond.repaymentNobInDays + days)
      );
      addByValue(
        "guaranteedTradeRevenue",
        addPlus(Bonds.triad(round(bond.guaranteedTradeRevenue))) +
          rub +
          brackets(addPlus(bond.guaranteedTradeRevenueInDays) + days)
      );
      addByValue(
        "purchaseCostWithNkd",
        Bonds.triad(round(bond.purchaseCostWithNkd)) + rub
      );
      addByValue(
        "calculatedDaysOwn",
        bond.calculatedDaysOwn + days + daysToMonth(bond.calculatedDaysOwn)
      );
      addByValue(
        "purchaseDiffInDays",
        addPlus(bond.purchaseDiffInDays) +
          days +
          daysToMonth(bond.purchaseDiffInDays, true)
      );
      addByValue(
        "nkdDelta",
        addPlus(Bonds.triad(round(bond.nkdDelta))) +
          rub +
          brackets(addPlus(bond.nkdDeltaInDays) + days)
      );
      addByValue(
        "allCoupons",
        addPlus(Bonds.triad(round(bond.allCoupons))) +
          rub +
          brackets(addPlus(bond.allCouponsInDays) + days)
      );
      addByValue(
        "allCouponsBefore",
        addPlus(Bonds.triad(round(bond.allCouponsBefore))) +
          rub +
          brackets(addPlus(bond.allCouponsBeforeInDays) + days)
      );
      addByValue(
        "allCouponsAfter",
        addPlus(Bonds.triad(round(bond.allCouponsAfter))) +
          rub +
          brackets(addPlus(bond.allCouponsAfterInDays) + days)
      );
      addByValue(
        "coupons",
        addPlus(Bonds.triad(round(bond.coupons))) +
          rub +
          brackets(addPlus(bond.couponsInDays) + days)
      );
      addByValue(
        "couponsBefore",
        addPlus(Bonds.triad(round(bond.couponsBefore))) +
          rub +
          brackets(addPlus(bond.couponsBeforeInDays) + days)
      );
      addByValue(
        "couponsAfter",
        addPlus(Bonds.triad(round(bond.couponsAfter))) +
          rub +
          brackets(addPlus(bond.couponsAfterInDays) + days)
      );
      addByValue(
        "baseCostDiff",
        addPlus(Bonds.triad(round(bond.baseCostDiff))) +
          rub +
          brackets(addPlus(bond.baseCostDiffInDays) + days)
      );
      addByField("couponPaymentCount");
      addByField("couponPaymentCountBefore");
      addByField("couponPaymentCountAfter");
      addByField("zeroOnePercentChangeInDays", days);
      addByField("onePercentChangeInDays", days);
      addByValue("sector", t("Bond." + bond.sector));
    }

    displayBond.extra = {};
    displayBond.extra.bondTitle = Bonds.getLocalBondName(bond);
    displayBond.extra.isRedeemed = isRedeemed;
    displayBond.extra.putOffer = bond.putOffer;
    displayBond.extra.putClass = "";
    displayBond.extra.redeemedClass = "";
    displayBond.extra.putRedeemedClass = "";
    if (!isRedeemed) {
      if (bond.putOffer) {
        displayBond.extra.revenuePercentTitle = t("Table.offerRevenue");
        displayBond.extra.dateTitle = t("Table.offerDate");
        displayBond.extra.daysTitle = t("Table.offerDays");
        displayBond.extra.putClass = "putOffer";
        displayBond.extra.bondTitle += " / " + t("Table.putOffer");
      }
    } else {
      displayBond.extra.redeemedClass = "redeemed";
      displayBond.extra.bondTitle += " / " + t("Table.redeemed");
    }
    displayBond.extra.putRedeemedClass =
      displayBond.extra.putClass + " " + displayBond.extra.redeemedClass;

    return displayBond;
  },

  isCrawlingMode: () => navigator.userAgent === "ReactSnap",

  fillDemoData: async (storage, dispatch, priceType, realRatePeriod) => {
    const apply = (bonds) => dispatch({ type: "setBonds", bonds: bonds });
    const url = "/" + storage + ".json";
    return fetch(url)
      .then((response) => response.text())
      .then((text) => {
        if (text) {
          window.localStorage.setItem(storage, text);
          return Bonds.fillBonds(storage, dispatch).then((allBonds) =>
            apply(
              Bonds.calculateRelativeTo(
                allBonds,
                priceType,
                dispatch,
                realRatePeriod
              )
            )
          );
        }
      });
  },

  getBondFields: () => [
    "rate",
    "currentYearRevenuePercent",
    "currentRevenuePercent",
    "purchasePercent",
    "currentPercent",
    "amount",
    "purchaseCostForAmount",
    "currentCostForAmount",
    "costDiff",
    "purchaseDiffInDays",
    "purchaseDate",
    "daysOwn",
    "yearsTillRepayment",
    "buyBackDate",
    "daysTillRedemption",
    "repaymentDate",
    "buyBackPrice",
    "couponPeriod",
    "couponDate",
    "daysTillCoupon",
    "couponPayment",
    "couponEarnings",
    "currentRevenue",
    "guaranteedRevenueDiff",
    "dayRevenueForAmount",
    "monthRevenueForAmount",
    "yearRevenueForAmount",
    "name",
    "fullName",
    "engName",
    "code",
    "isin",
    "baseDiffInDays",
    "finalDate",
    "bid",
    "offer",
    "totalBid",
    "totalOffer",
    "bidOfferRatio",
    "priceChange",
    "prevDayPriceChange",
    "tradeCount",
    "totalTradeVolume",
    "lastTradeVolume",
    "lastTradeTime",
    "openPrice",
    "lowPrice",
    "highPrice",
    "spread",
    "lotValue",
    "averagePrice",
    "prevDayAveragePriceChange",
    "listing",
    "feeForPurchase",
    "feeForSale",
    "nkd",
    "nkdForAmount",
    "buyNkd",
    "buyNkdWithDays",
    "tradeRevenue",
    "guaranteedTradeRevenue",
    "purchaseCostWithNkd",
    "nkdPercent",
    "calculatedDaysOwn",
    "calculatedDaysOwnDiff",
    "rateToBaseDiffInDays",
    "nkdDelta",
    "allCoupons",
    "coupons",
    "nob",
    "repaymentNob",
    "baseCostDiff",
    "couponPaymentCount",
    "currentSellPeriod",
    "currentWaitPeriod",
    "nkdPeriod",
    "buyNkdPercent",
    "lowHighPrice",
    "onePercentChangeInDays",
    "zeroOnePercentChangeInDays",
    "couponPaymentCountBefore",
    "couponPaymentCountAfter",
    "couponPaymentBefore",
    "couponPaymentAfter",
    "couponsBefore",
    "couponsAfter",
    "allCouponsBefore",
    "allCouponsAfter",
    "realRate",
    "revenueByRepaymentPercent",
    "daysTillRepayment",
    "guaranteedRevenueByRepayment",
    "guaranteedRevenueByRepaymentPercent",
    "guaranteedRevenueDiffInDays",
    "sector",
    "remainRepaymentRate",
    "currentYield",
    "currentYieldModified",
    "nomYield",
    "duration",
    "durationModified",
    "pvbp",
    "currentYieldNN",
    "currentYieldModifiedNN",
  ],

  getBondTitle: ({ put, redeemed, table, t }) => {
    let result = {};
    Bonds.getBondFields().forEach(
      (value) => (result[value] = t("Bond." + value))
    );
    result.revenueByRepaymentPercent =
      t("Bond.revenueByRepaymentPercent.part1") +
      (table
        ? t("Bond.revenueByRepaymentPercent.part2")
        : put
        ? t("Bond.revenueByRepaymentPercent.part3")
        : t("Bond.revenueByRepaymentPercent.part4"));
    result.simpleYield =
      t("Bond.simpleYield.part1") +
      (table
        ? t("Bond.simpleYield.part2")
        : put
        ? t("Bond.simpleYield.part3")
        : t("Bond.simpleYield.part4"));
    result.simpleYieldNN =
      t("Bond.simpleYieldNN.part1") +
      (table
        ? t("Bond.simpleYieldNN.part2")
        : put
        ? t("Bond.simpleYieldNN.part3")
        : t("Bond.simpleYieldNN.part4")) +
      t("Bond.simpleYieldNN.part5");
    result.ytm =
      t("Bond.ytm.part1") +
      (table
        ? t("Bond.ytm.part2")
        : put
        ? t("Bond.ytm.part3")
        : t("Bond.ytm.part4"));
    result.daysTillRepayment =
      t("Bond.daysTillRepayment.part1") +
      (table
        ? t("Bond.daysTillRepayment.part2")
        : put && !redeemed
        ? t("Bond.daysTillRepayment.part3")
        : t("Bond.daysTillRepayment.part4"));
    result.guaranteedRevenueByRepayment =
      t("Bond.guaranteedRevenueByRepayment.part1") +
      (put
        ? t("Bond.guaranteedRevenueByRepayment.part2")
        : t("Bond.guaranteedRevenueByRepayment.part3"));
    result.guaranteedRevenueByRepaymentPercent =
      t("Bond.guaranteedRevenueByRepayment.part1") +
      (put
        ? t("Bond.guaranteedRevenueByRepayment.part2")
        : t("Bond.guaranteedRevenueByRepayment.part3"));
    result.guaranteedRevenueDiffInDays =
      t("Bond.guaranteedRevenueDiffInDays.part1") +
      (put
        ? t("Bond.guaranteedRevenueDiffInDays.part2")
        : t("Bond.guaranteedRevenueDiffInDays.part3"));
    return result;
  },

  getTableColumns: (t) => {
    let columns = {
      bondCard: {
        name: t("Columns.bond"),
      },
      newBondCard: {
        name: t("Columns.bond"),
      },
      actions: {
        name: t("Columns.actions"),
      },
      rate: {
        sorting: ["sortByRateDesc", "sortByRateAsc"],
      },
      amount: {
        sorting: ["sortByAmountDesc", "sortByAmountAsc"],
      },
      purchasePercent: {
        sorting: ["sortByPurchasePercentDesc", "sortByPurchasePercentAsc"],
      },
      currentPercent: {
        sorting: ["sortByPriceDesc", "sortByPriceAsc"],
      },
      revenueByRepaymentPercent: {
        sorting: ["sortByRevenueDesc", "sortByRevenueAsc"],
      },
      currentRevenuePercent: {
        sorting: ["sortByCurrentRevenueDesc", "sortByCurrentRevenueAsc"],
      },
      currentYearRevenuePercent: {
        sorting: [
          "sortByCurrentYearRevenueDesc",
          "sortByCurrentYearRevenueAsc",
        ],
      },
      daysTillRepayment: {
        sorting: ["sortByDaysTillRepaymentDesc", "sortByDaysTillRepaymentAsc"],
      },
      daysTillCoupon: {
        sorting: ["sortDaysTillCouponDesc", "sortDaysTillCouponAsc"],
      },
      purchaseDate: {},
      baseDiffInDays: {
        sorting: ["sortByBaseDiffInDaysDesc", "sortByBaseDiffInDaysAsc"],
      },
      finalDate: {},
      bid: {
        sorting: ["sortByBidDesc", "sortByBidAsc"],
      },
      offer: {
        sorting: ["sortByOfferDesc", "sortByOfferAsc"],
      },
      totalBid: {
        sorting: ["sortByTotalBidDesc", "sortByTotalBidAsc"],
      },
      totalOffer: {
        sorting: ["sortByTotalOfferDesc", "sortByTotalOfferAsc"],
      },
      bidOfferRatio: {
        sorting: ["sortByBidOfferRatioDesc", "sortByBidOfferRatioAsc"],
      },
      priceChange: {
        sorting: ["sortByPriceChangeDesc", "sortByPriceChangeAsc"],
      },
      prevDayPriceChange: {
        sorting: [
          "sortByPrevDayPriceChangeDesc",
          "sortByPrevDayPriceChangeAsc",
        ],
      },
      tradeCount: {
        sorting: ["sortByTradeCountDesc", "sortByTradeCountAsc"],
      },
      totalTradeVolume: {
        sorting: ["sortByTotalTradeVolumeDesc", "sortByTotalTradeVolumeAsc"],
      },
      lastTradeVolume: {
        sorting: ["sortByLastTradeVolumeDesc", "sortByLastTradeVolumeAsc"],
      },
      lastTradeTime: {},
      openPrice: {
        sorting: ["sortByOpenPriceDesc", "sortByOpenPriceAsc"],
      },
      lowPrice: {
        sorting: ["sortByLowPriceDesc", "sortByLowPriceAsc"],
      },
      highPrice: {
        sorting: ["sortByHighPriceDesc", "sortByHighPriceAsc"],
      },
      spread: {
        sorting: ["sortBySpreadDesc", "sortBySpreadAsc"],
      },
      lotValue: {
        sorting: ["sortByLotValueDesc", "sortByLotValueAsc"],
      },
      averagePrice: {
        sorting: ["sortByAveragePriceDesc", "sortByAveragePriceAsc"],
      },
      prevDayAveragePriceChange: {
        sorting: [
          "sortByPrevDayAveragePriceChangeDesc",
          "sortByPrevDayAveragePriceChangeAsc",
        ],
      },
      code: {},
      listing: {},
      nkdPercent: {
        sorting: ["sortByNkdPercentDesc", "sortByNkdPercentAsc"],
      },
      calculatedDaysOwnDiff: {
        sorting: [
          "sortByCalculatedDaysOwnDiffDesc",
          "sortByCalculatedDaysOwnDiffAsc",
        ],
      },
      rateToBaseDiffInDays: {
        sorting: [
          "sortByRateToBaseDiffInDaysDesc",
          "sortByRateToBaseDiffInDaysAsc",
        ],
      },
      nkdPeriod: {},
      currentSellPeriod: {
        sorting: ["sortByCurrentSellPeriodDesc", "sortByCurrentSellPeriodAsc"],
      },
      currentWaitPeriod: {
        sorting: ["sortByCurrentWaitPeriodDesc", "sortByCurrentWaitPeriodAsc"],
      },
      buyNkdPercent: {
        sorting: ["sortByBuyNkdPercentDesc", "sortByBuyNkdPercentAsc"],
      },
      lowHighPrice: {},
      realRate: {
        sorting: ["sortByRealRateDesc", "sortByRealRateAsc"],
      },
      remainRepaymentRate: {
        sorting: [
          "sortByRemainRepaymentRateDesc",
          "sortByRemainRepaymentRateAsc",
        ],
      },
    };

    const bondTitle = Bonds.getBondTitle({ table: true, t });
    for (const name in columns) {
      if (columns[name].name) continue;
      columns[name].name = bondTitle[name];
    }

    return columns;
  },

  isSet: (value) => value !== null && value !== undefined,

  boolForLs: (value) => (value ? 1 : ""),

  scrollTo: (id, noEffects) => {
    const element = document.getElementById(id);
    if (!element) return;

    if (noEffects) element.scrollIntoView();
    else element.scrollIntoView({ behavior: "smooth" });
  },

  actionButtonNames: (name, t) => ({
    readyName: t("Buttons." + name + ".start"),
    loadingName: t("Buttons." + name + ".loading"),
  }),

  calculateRelativeTo: (bonds, priceType, dispatch, realRatePeriod) => {
    const calculatedBonds = bonds.map((bond) =>
      Bonds.calculate(bond, priceType, realRatePeriod)
    );
    dispatch({
      type: "saveCalculatedBonds",
      calculatedBonds: calculatedBonds,
    });
    return calculatedBonds;
  },

  // writeFilterData: (data) => Functions.setToLs(data, 'filters'),

  // readFilterData: () => {
  //     const filters = Functions.getFromLs('filters');
  //     window.localStorage.removeItem('filters');
  //     return filters;
  // },

  getYandexID: () => {
    if (Bonds.isRus()) return 57188851;
    else {
      if (Bonds.isEng()) return 65838856;
    }
  },

  setYandexGoal: (name) => {
    const id = Bonds.getYandexID();
    window.ym(id, "reachGoal", name);
  },

  getFees: () => Bonds.getFromLs("fees"),

  setFees: (fees) => {
    Bonds.setToLs(fees, "fees");
  },

  newAndFindBondsColumns: (extraColumns, actions) => {
    let result;
    if (extraColumns) {
      result = [
        "newBondCard",
        "rate",
        "realRate",
        "rateToBaseDiffInDays",
        "revenueByRepaymentPercent",
        "currentPercent",
        "bid",
        "lowHighPrice",
        "averagePrice",
        "offer",
        "spread",
        "baseDiffInDays",
        "nkdPercent",
        "nkdPeriod",
        "tradeCount",
        "totalTradeVolume",
        "lastTradeVolume",
        "lastTradeTime",
        "totalBid",
        "totalOffer",
        "bidOfferRatio",
        "lotValue",
        "listing",
        "daysTillCoupon",
        "daysTillRepayment",
        "finalDate",
        "code",
      ];
    } else {
      result = [
        "newBondCard",
        "rate",
        "realRate",
        "rateToBaseDiffInDays",
        "revenueByRepaymentPercent",
        "currentPercent",
        "bid",
        "lowHighPrice",
        "averagePrice",
        "baseDiffInDays",
        "nkdPercent",
        "nkdPeriod",
        "tradeCount",
        "totalTradeVolume",
        "bidOfferRatio",
        "lastTradeTime",
        "lotValue",
        "daysTillRepayment",
        "finalDate",
        "code",
      ];
    }
    if (actions === true) result.push("actions");
    return result;
  },

  mapRows: (columns, data) => {
    return columns.map((value) => data[value]);
  },

  mapColumns: (columns, data) => {
    return columns.map((value) => ({ ...data[value], field: value }));
  },

  getLocalBondName: (bond) => {
    if (Bonds.isRus()) return bond.name;
    else return bond.engName;
  },

  getBondTooltips: (t) => {
    const result = {};
    let pattern = /^BondTooltip/;
    Bonds.getBondFields().forEach((field) => {
      const value = t("BondTooltip." + field);
      if (!pattern.test(value)) result[field] = value;
    });
    return result;
  },

  tooltipDelay: () => 250,

  triad: (value) =>
    value
      ? value.toString().replace(/(\d)(?=(\d{3})+([^\d]|$))/g, "$1 ")
      : value,

  formatDate: function (dateString) {
    if (Intl && Intl.DateTimeFormat && Bonds.isDateValid(dateString)) {
      var formatter = new Intl.DateTimeFormat(Bonds.getCurrentLanguage(), {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const date = new Date(dateString);
      return formatter.format(date);
    } else return dateString;
  },
};
