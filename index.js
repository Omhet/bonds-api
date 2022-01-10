import compression from "compression";
import cors from "cors";
import express from "express";
// import cache from "express-aggressive-cache";
import { Bonds } from "./bonds.js";
import { getBondData } from "./utils.js";

const app = express();

app.use(cors());
app.use(compression());

// app.use(
//   cache({
//     maxAge: 3600,
//   }).middleware
// );

app.get("/sheet", async (req, res) => {
  try {
    const { code } = req.query;
    const bond = await Bonds.updateBond({ code });
    const data = Bonds.calculate(bond);
    if (!data) {
      res.status(404).send("No data");
      return;
    }

    const { simpleYield, yearsTillRepayment, currentCostWithNkd } =
      getBondData(data);

    res
      .status(200)
      .send(`${simpleYield},${yearsTillRepayment},${currentCostWithNkd}`);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.get("/sheet-no-price", async (req, res) => {
  try {
    const { code } = req.query;
    const bond = await Bonds.updateBond({ code });
    const data = Bonds.calculate(bond);
    if (!data) {
      res.status(404).send("No data");
      return;
    }

    const { daysTillRepayment, couponsSum, putOffer } = getBondData(data);

    const hasOfferAnswer = putOffer ? "Да" : "Нет";

    res
      .status(200)
      .send(`${couponsSum},${daysTillRepayment},${hasOfferAnswer}`);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.get("/json", async (req, res) => {
  try {
    const { code } = req.query;
    const bond = await Bonds.updateBond({ code });
    const data = Bonds.calculate(bond);
    if (!data) {
      res.status(404).send("No data");
      return;
    }

    res.json(data);
  } catch (e) {
    res.status(500).send(e);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Your app is listening on port " + port);
});
