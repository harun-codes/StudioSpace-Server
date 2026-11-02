import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'
const app = express();
const PORT = 5000

app.use(cors())
app.use(express.json())

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const mongoClient = await connectToMongoDB();
const db = mongoClient.db("StudioSpace");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");


app.get("/studios", async (req, res) => {
  try {
    const result = await studiosCollection.find({}).toArray();

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch studios"
    });
  }
});

app.get("/featured-studios", async (req, res) => {
  try {
    const result = await studiosCollection
      .find({ isActive: { $ne: false } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch featured studios",
    });
  }
});

app.get("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(id),
      isActive: { $ne: false },
    });

    res.status(200).json(studio);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studio details",
    });
  }
});


app.post("/add-studios", async (req, res) => {
  try {
    const studioData = req.body;  
    const result = await studiosCollection.insertOne(studioData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create studio",
    });
  }
});


app.get("/my-listings", async (req, res) => {
  try {
    const { ownerEmail } = req.query;

    if (!ownerEmail || typeof ownerEmail !== "string") {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const studios = await studiosCollection
      .find({ ownerEmail })
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studio listings",
    });
  }
});


app.patch('/my-listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const result = await studiosCollection.updateOne(
        {
            _id: new ObjectId(id)
        },
        { $set: updatedData }
    )
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update studio listing",
    });
  }
})


app.delete('/my-listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete studio listing",
    });
  }
})



app.post("/bookings", async (req, res) => {
  try {
    const {
      studioId,
      bookingDate,
      startTime,
      endTime,
      userName,
      userEmail,
    } = req.body;

    if (
      !ObjectId.isValid(studioId) ||
      !bookingDate ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
      startTime >= endTime ||
      !userName ||
      !userEmail
    ) {
      return res.status(400).json({
        message: "Invalid booking information",
      });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    const overlap = await bookingsCollection.findOne({
      studioId,
      bookingDate,
      status: "Confirmed",
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });

    if (overlap) {
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another time.",
      });
    }

    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const durationHours =
      (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60;

    const bookingData = {
      studioId,
      studioTitle: studio.title,
      bookingDate,
      startTime,
      endTime,
      durationHours,
      hourlyRate: studio.hourlyRate,
      totalPrice: durationHours * studio.hourlyRate,
      userName,
      userEmail: userEmail.trim().toLowerCase(),
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(bookingData);

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create booking",
    });
  }
});


app.get("/my-bookings", async (req, res) => {
  try {
    const { userEmail } = req.query;

    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const bookings = await bookingsCollection
      .find({ userEmail: userEmail.trim().toLowerCase() })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch bookings",
    });
  }
});



app.patch("/my-bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    const result = await bookingsCollection.updateOne(
      {
        _id: new ObjectId(id),
        status: "Pending",
      },
      {
        $set: { status: "Cancelled" },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({
        message: "Only pending bookings can be cancelled",
      });
    }

    res.status(200).json({
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to cancel booking",
    });
  }
});



app.get('/', (req,res) => {
    res.send('Server is Running Fine')
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})

