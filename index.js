const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

const stripe = require("stripe")(process.env.SECRET_STRIP);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.c0opl.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.TOKEN, function (err, decoded) {
    if (err) {
      res.status(403).send({ message: "Access Expired" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client
      .db("doctors_portal")
      .collection("bookings");
    const userCollection = client.db("doctors_portal").collection("users");
    const doctorCollection = client.db("doctors_portal").collection("doctors");
    const paymentCollection = client.db("doctors_portal").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded?.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Access Denied" });
      }
    };

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.post("/create-payment-intent",verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
        
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send({ result });
      } else {
        res.status(403).send({ message: "Access Denied" });
      }
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      var token = jwt.sign({ email: email }, process.env.TOKEN, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });

    // app.get('/available', async (req, res)=>{
    //   const date = req.query.date;
    //   const services= await servicesCollection.find().toArray()

    //   const query = {date: date};
    //   const bookings = await bookingCollection.find(query).toArray()

    //   services.forEach(service=>{
    //     const serviceBooking = bookings.filter(b=>b.treatment===service.name);
    //     const booked = serviceBooking.map(s=>s.slot)
    //     // service.booked = booked;
    //     const availableSlots = service.slots.filter(s=>!booked.includes(s))
    //     service.slots = availableSlots;
    //   })
    //   res.send(services)
    // })

    app.get("/available", async (req, res) => {
      const date = req.query.date;
      const services = await servicesCollection.find().toArray();

      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      services.forEach((service) => {
        const serviceBooking = bookings.filter(
          (b) => b.treatment === service.name
        );

        const booked = serviceBooking.map((s) => s.slot);
        const availableSlots = service.slots.filter((s) => !booked.includes(s));

        service.slots = availableSlots;
      });
      res.send(services);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      } else {
        res.status(403).send({ message: "Access Expired" });
      }
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ acknowledged: false });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.patch('/bookings/:id', async (req, res)=>{
      const id = req.params.id;
      const payment = req.body;
      const query = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId


        }
      }
      const updatedBooking = await bookingCollection.updateOne(query, updateDoc);
      const result = await paymentCollection.insertOne(payment);
      res.send(updatedBooking)
    })

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });

    app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctors/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await doctorCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello doctor portal!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
