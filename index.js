import compression from "compression";
import cors from "cors";
import express from "express";
// import cache from "express-aggressive-cache";
import { Bonds } from "./bonds.js";

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

    let { simpleYield, daysTillRedemption, currentCostWithNkd } = data;
    const yearsTillRedemption = (daysTillRedemption / 365).toFixed(2);
    simpleYield = simpleYield.toFixed(3);
    currentCostWithNkd = currentCostWithNkd.toFixed(2);

    res
      .status(200)
      .send(`${simpleYield},${yearsTillRedemption},${currentCostWithNkd}`);
  } catch (e) {
    res.status(500).send(e);
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
