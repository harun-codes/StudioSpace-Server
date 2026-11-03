
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { verifyToken } from "./middleware/require-auth.js";

const app = express();
const PORT = 5000;

if (!process.env.CLIENT_URL || !process.env.MONGODB_URL) {
  throw new Error("CLIENT_URL or MONGODB_URL is missing.");
}

const frontendOrigin = new URL(process.env.CLIENT_URL).origin;

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "2mb" }));

const client = new MongoClient(process.env.MONGODB_URL);

await client.connect();

console.log("You successfully connected to MongoDB!");

const db = client.db("StudioSpace");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");

const validCategories = [
  "Photo Studio",
  "Film Stage",
  "Podcast Lounge",
  "Music Suite",
  "Workshop",
];

const isValidId = (id) =>
  typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);

const isValidImageUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const verifyOrigin = (req, res, next) => {
  const origin = req.get("Origin");

  if (origin && origin !== frontendOrigin) {
    return res.status(403).json({
      message: "Request origin is not allowed.",
    });
  }

  return next();
};

const studioOwnerFilter = (user) => ({
  $or: [
    { ownerId: user.userId },
    {
      ownerId: { $exists: false },
      ownerEmail: user.email,
    },
  ],
});

const bookingOwnerFilter = (user) => ({
  $or: [
    { userId: user.userId },
    {
      userId: { $exists: false },
      userEmail: user.email,
    },
  ],
});

const isStudioOwner = (studio, user) => {
  if (studio.ownerId) {
    return studio.ownerId === user.userId;
  }

  return (
    typeof studio.ownerEmail === "string" &&
    studio.ownerEmail.trim().toLowerCase() === user.email
  );
};

const isBookingOwner = (booking, user) => {
  if (booking.userId) {
    return booking.userId === user.userId;
  }

  return (
    typeof booking.userEmail === "string" &&
    booking.userEmail.trim().toLowerCase() === user.email
  );
};

const isValidBookingDate = (date) => {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};


app.get("/", (req, res) => {
  return res.send("StudioSpace Server is Running Fine");
});


app.get("/auth-check", verifyToken, (req, res) => {
  return res.status(200).json({
    authenticated: true,
    message: "JWT verified successfully",
    user: {
      id: req.auth.userId,
      email: req.auth.email,
      name: req.auth.name,
    },
  });
});


app.get("/studios", async (req, res) => {
  try {
    const studios = await studiosCollection
      .find({ isActive: { $ne: false } })
      .toArray();

    return res.status(200).json(studios);
  } catch (error) {
    console.error("Fetch studios error:", error);

    return res.status(500).json({
      message: "Failed to fetch studios.",
    });
  }
});


app.get("/featured-studios", async (req, res) => {
  try {
    const studios = await studiosCollection
      .find({ isActive: { $ne: false } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();

    return res.status(200).json(studios);
  } catch (error) {
    console.error("Featured studios error:", error);

    return res.status(500).json({
      message: "Failed to fetch featured studios.",
    });
  }
});


app.get("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    const studio = await studiosCollection.findOne({
      $or: [
        { _id: new ObjectId(id) },
        { _id: id },
      ],
      isActive: { $ne: false },
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found.",
      });
    }

    return res.status(200).json(studio);
  } catch (error) {
    console.error("Studio details error:", error);

    return res.status(500).json({
      message: "Failed to fetch studio details.",
    });
  }
});


app.post(
  "/add-studios",
  verifyToken,
  verifyOrigin,
  async (req, res) => {
    try {
      const data = req.body;

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return res.status(400).json({
          message: "Invalid studio information.",
        });
      }

      const title =
        typeof data.title === "string" ? data.title.trim() : "";

      const category =
        typeof data.category === "string" ? data.category : "";

      const location =
        typeof data.location === "string" ? data.location.trim() : "";

      const imageUrl =
        typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";

      const overview =
        typeof data.overview === "string" ? data.overview.trim() : "";

      const hourlyRate = Number(data.hourlyRate);
      const securityDeposit = Number(data.securityDeposit);
      const maxCapacity = Number(data.maxCapacity);

      const amenities = Array.isArray(data.amenities)
        ? [
            ...new Set(
              data.amenities
                .filter(
                  (item) =>
                    typeof item === "string" && item.trim()
                )
                .map((item) => item.trim())
            ),
          ]
        : [];

      if (
        title.length < 5 ||
        title.length > 120 ||
        !validCategories.includes(category) ||
        !location ||
        !isValidImageUrl(imageUrl) ||
        overview.length < 20 ||
        !Number.isFinite(hourlyRate) ||
        hourlyRate <= 0 ||
        !Number.isFinite(securityDeposit) ||
        securityDeposit < 0 ||
        !Number.isInteger(maxCapacity) ||
        maxCapacity < 1 ||
        amenities.length === 0
      ) {
        return res.status(400).json({
          message: "Please provide valid studio information.",
        });
      }

      const studioData = {
        title,
        category,
        hourlyRate,
        securityDeposit,
        maxCapacity,
        location,
        imageUrl,
        overview,
        amenities,
        ownerId: req.auth.userId,
        ownerName: req.auth.name || req.auth.email,
        ownerEmail: req.auth.email,
        isActive: true,
        rating: 0,
        reviewCount: 0,
        reviews: [],
        galleryImages: [],
        createdAt: new Date().toISOString(),
      };

      const result = await studiosCollection.insertOne(studioData);

      return res.status(201).json(result);
    } catch (error) {
      console.error("Add studio error:", error);

      return res.status(500).json({
        message: "Failed to create studio.",
      });
    }
  }
);


app.get("/my-listings", verifyToken, async (req, res) => {
  try {
    const studios = await studiosCollection
      .find(studioOwnerFilter(req.auth))
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(studios);
  } catch (error) {
    console.error("My Listings error:", error);

    return res.status(500).json({
      message: "Failed to fetch studio listings.",
    });
  }
});


const updateStudio = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid studio ID.",
      });
    }

    const objectId = new ObjectId(id);

    const studio = await studiosCollection.findOne({
      _id: objectId,
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found.",
      });
    }

    if (!isStudioOwner(studio, req.auth)) {
      return res.status(403).json({
        message: "You are not authorized to update this studio.",
      });
    }

    const data = req.body;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({
        message: "Invalid update information.",
      });
    }

    const updates = {};

    if (Object.hasOwn(data, "title")) {
      const value =
        typeof data.title === "string" ? data.title.trim() : "";

      if (value.length < 5 || value.length > 120) {
        return res.status(400).json({
          message: "Invalid studio title.",
        });
      }

      updates.title = value;
    }

    if (Object.hasOwn(data, "category")) {
      if (!validCategories.includes(data.category)) {
        return res.status(400).json({
          message: "Invalid studio category.",
        });
      }

      updates.category = data.category;
    }

    if (Object.hasOwn(data, "hourlyRate")) {
      const value = Number(data.hourlyRate);

      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({
          message: "Invalid hourly rate.",
        });
      }

      updates.hourlyRate = value;
    }

    if (Object.hasOwn(data, "securityDeposit")) {
      const value = Number(data.securityDeposit);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          message: "Invalid security deposit.",
        });
      }

      updates.securityDeposit = value;
    }

    if (Object.hasOwn(data, "maxCapacity")) {
      const value = Number(data.maxCapacity);

      if (!Number.isInteger(value) || value < 1) {
        return res.status(400).json({
          message: "Invalid maximum capacity.",
        });
      }

      updates.maxCapacity = value;
    }

    if (Object.hasOwn(data, "location")) {
      const value =
        typeof data.location === "string" ? data.location.trim() : "";

      if (!value) {
        return res.status(400).json({
          message: "Invalid studio location.",
        });
      }

      updates.location = value;
    }

    if (Object.hasOwn(data, "imageUrl")) {
      const value =
        typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";

      if (!isValidImageUrl(value)) {
        return res.status(400).json({
          message: "Invalid studio image URL.",
        });
      }

      updates.imageUrl = value;
    }

    if (Object.hasOwn(data, "overview")) {
      const value =
        typeof data.overview === "string" ? data.overview.trim() : "";

      if (value.length < 20) {
        return res.status(400).json({
          message: "Invalid studio overview.",
        });
      }

      updates.overview = value;
    }

    if (Object.hasOwn(data, "amenities")) {
      if (
        !Array.isArray(data.amenities) ||
        !data.amenities.every(
          (item) => typeof item === "string" && item.trim()
        )
      ) {
        return res.status(400).json({
          message: "Invalid studio amenities.",
        });
      }

      updates.amenities = [
        ...new Set(data.amenities.map((item) => item.trim())),
      ];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "No valid studio fields provided.",
      });
    }

    updates.updatedAt = new Date().toISOString();

    const result = await studiosCollection.updateOne(
      {
        _id: objectId,
        ...studioOwnerFilter(req.auth),
      },
      {
        $set: updates,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(403).json({
        message: "You are not authorized to update this studio.",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Update studio error:", error);

    return res.status(500).json({
      message: "Failed to update studio listing.",
    });
  }
};

app.patch(
  "/my-listings/:id",
  verifyToken,
  verifyOrigin,
  updateStudio
);

app.put(
  "/my-listings/:id",
  verifyToken,
  verifyOrigin,
  updateStudio
);


app.delete(
  "/my-listings/:id",
  verifyToken,
  verifyOrigin,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          message: "Invalid studio ID.",
        });
      }

      const objectId = new ObjectId(id);

      const studio = await studiosCollection.findOne({
        _id: objectId,
      });

      if (!studio) {
        return res.status(404).json({
          message: "Studio not found.",
        });
      }

      if (!isStudioOwner(studio, req.auth)) {
        return res.status(403).json({
          message: "You are not authorized to delete this studio.",
        });
      }

      const result = await studiosCollection.deleteOne({
        _id: objectId,
        ...studioOwnerFilter(req.auth),
      });

      if (result.deletedCount === 0) {
        return res.status(403).json({
          message: "You are not authorized to delete this studio.",
        });
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error("Delete studio error:", error);

      return res.status(500).json({
        message: "Failed to delete studio listing.",
      });
    }
  }
);


app.post(
  "/bookings",
  verifyToken,
  verifyOrigin,
  async (req, res) => {
    try {
      const {
        studioId,
        bookingDate,
        startTime,
        endTime,
      } = req.body || {};

      if (
        !isValidId(studioId) ||
        !isValidBookingDate(bookingDate) ||
        typeof startTime !== "string" ||
        typeof endTime !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
        startTime >= endTime
      ) {
        return res.status(400).json({
          message: "Invalid booking information.",
        });
      }

      const studio = await studiosCollection.findOne({
        _id: new ObjectId(studioId),
        isActive: { $ne: false },
      });

      if (!studio) {
        return res.status(404).json({
          message: "Studio not found.",
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

      const [startHour, startMinute] =
        startTime.split(":").map(Number);

      const [endHour, endMinute] =
        endTime.split(":").map(Number);

      const durationHours =
        (
          endHour * 60 +
          endMinute -
          startHour * 60 -
          startMinute
        ) / 60;

      const hourlyRate = Number(studio.hourlyRate);

      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
        return res.status(400).json({
          message: "Invalid studio hourly rate.",
        });
      }

      const bookingData = {
        studioId,
        studioTitle: studio.title,
        bookingDate,
        startTime,
        endTime,
        durationHours,
        hourlyRate,
        totalPrice: durationHours * hourlyRate,
        userId: req.auth.userId,
        userName: req.auth.name || req.auth.email,
        userEmail: req.auth.email,
        status: "Pending",
        createdAt: new Date(),
      };

      const result = await bookingsCollection.insertOne(bookingData);

      return res.status(201).json(result);
    } catch (error) {
      console.error("Create booking error:", error);

      return res.status(500).json({
        message: "Failed to create booking.",
      });
    }
  }
);


app.get("/my-bookings", verifyToken, async (req, res) => {
  try {
    const bookings = await bookingsCollection
      .find(bookingOwnerFilter(req.auth))
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(bookings);
  } catch (error) {
    console.error("My Bookings error:", error);

    return res.status(500).json({
      message: "Failed to fetch bookings.",
    });
  }
});


app.patch(
  "/my-bookings/:id",
  verifyToken,
  verifyOrigin,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          message: "Invalid booking ID.",
        });
      }

      const objectId = new ObjectId(id);

      const booking = await bookingsCollection.findOne({
        _id: objectId,
      });

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found.",
        });
      }

      if (!isBookingOwner(booking, req.auth)) {
        return res.status(403).json({
          message: "You are not authorized to cancel this booking.",
        });
      }

      if (booking.status !== "Pending") {
        return res.status(409).json({
          message: "Only pending bookings can be cancelled.",
        });
      }

      const result = await bookingsCollection.updateOne(
        {
          _id: objectId,
          status: "Pending",
          ...bookingOwnerFilter(req.auth),
        },
        {
          $set: {
            status: "Cancelled",
            cancelledAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(409).json({
          message: "Booking could not be cancelled.",
        });
      }

      return res.status(200).json({
        message: "Booking cancelled successfully.",
      });
    } catch (error) {
      console.error("Cancel booking error:", error);

      return res.status(500).json({
        message: "Failed to cancel booking.",
      });
    }
  }
);


app.listen(PORT, () => {
  console.log(`StudioSpace server is running on port ${PORT}`);
});
