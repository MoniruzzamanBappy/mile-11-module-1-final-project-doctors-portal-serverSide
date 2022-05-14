const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app = express()
const port =process.env.PORT || 5000

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.c0opl.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run() {
    try{
        await client.connect();
        const servicesCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("bookings");
        app.get('/services', async(req, res)=>{
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
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

        app.get('/available', async (req, res)=>{
          const date = req.query.date;
          const services = await servicesCollection.find().toArray();

          const query = {date: date};
          const bookings = await bookingCollection.find(query).toArray()

          services.forEach(service=>{
            const serviceBooking = bookings.filter(b=>b.treatment === service.name);

            const booked = serviceBooking.map(s=>s.slot);
            const availableSlots = service.slots.filter(s=>!booked.includes(s))
            
            service.slots= availableSlots;
          })
          res.send(services)

        })

        app.get('/bookings', async (req, res)=>{
          const patient = req.query.patient;
          const query = {patient: patient};
          const bookings = await bookingCollection.find(query).toArray()
          res.send(bookings);

        })

        app.post('/bookings', async (req, res)=>{
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
          const exist = await bookingCollection.findOne(query)
          if(exist){
            return res.send({acknowledged: false})
          }
          const result = await bookingCollection.insertOne(booking);
          res.send(result);
        })
    }
    finally{

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello doctor portal!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})