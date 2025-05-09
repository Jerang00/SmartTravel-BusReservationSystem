const express = require("express");
const session = require("express-session");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const app = express();

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root@123",
  database: process.env.DB_NAME || "bus",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test the connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL database");
  connection.release();
});

// Handle database connection errors
pool.on("error", (err) => {
  console.error("Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.log("Database connection was closed.");
  }
  if (err.code === "ER_CON_COUNT_ERROR") {
    console.log("Database has too many connections.");
  }
  if (err.code === "ECONNREFUSED") {
    console.log("Database connection was refused.");
  }
});

// Middleware
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Add path to all views
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.user = req.session.user;
  next();
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect("/admin/login");
  }
};

// Role-based access control
const hasRole = (roles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.session.user.Role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
};

// In-memory storage for bookings
const bookings = [];

// Routes
app.get("/", (req, res) => {
  const query = `
    SELECT r.RouteID, c1.CityName as Source, c2.CityName as Destination, 
           r.Distance, r.EstimatedTime, MIN(p.BasePrice) as MinPrice
    FROM Routes r
    JOIN Cities c1 ON r.SourceCityID = c1.CityID
    JOIN Cities c2 ON r.DestinationCityID = c2.CityID
    JOIN Schedules s ON r.RouteID = s.RouteID
    JOIN Buses b ON s.BusID = b.BusID
    JOIN Pricing p ON r.RouteID = p.RouteID AND b.BusTypeID = p.BusTypeID
    GROUP BY r.RouteID, c1.CityName, c2.CityName, r.Distance, r.EstimatedTime
    ORDER BY (
      SELECT COUNT(*)
      FROM Bookings b
      JOIN Schedules s2 ON b.ScheduleID = s2.ScheduleID
      WHERE s2.RouteID = r.RouteID
    ) DESC
    LIMIT 3
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching popular routes:", err);
      res.render("index", { user: req.session.user });
      return;
    }
    res.render("index", {
      user: req.session.user,
      popularRoutes: results,
    });
  });
});

app.get("/booking", async (req, res) => {
  try {
    const { from, to, date } = req.query;

    // Get all cities for dropdowns
    const [cities] = await pool
      .promise()
      .query("SELECT * FROM Cities ORDER BY CityName");

    // Get all routes for dropdowns
    const [routes] = await pool.promise().query(`
      SELECT r.RouteID, c1.CityName as SourceCity, c2.CityName as DestinationCity
      FROM Routes r
      JOIN Cities c1 ON r.SourceCityID = c1.CityID
      JOIN Cities c2 ON r.DestinationCityID = c2.CityID
    `);

    // Base query for buses
    let query = `
      SELECT DISTINCT sch.ScheduleID, b.BusID, b.BusNumber, bt.TypeName, bt.Capacity,
             sch.DepartureTime, sch.ArrivalTime,
             src.CityName as SourceCity, dest.CityName as DestinationCity,
             r.Distance, r.EstimatedTime,
             p.BasePrice,
             COUNT(DISTINCT ss.SeatID) as BookedSeats
      FROM Buses b
      JOIN BusTypes bt ON b.BusTypeID = bt.BusTypeID
      JOIN Schedules sch ON b.BusID = sch.BusID
      JOIN Routes r ON sch.RouteID = r.RouteID
      JOIN Cities src ON r.SourceCityID = src.CityID
      JOIN Cities dest ON r.DestinationCityID = dest.CityID
      JOIN Pricing p ON r.RouteID = p.RouteID AND bt.BusTypeID = p.BusTypeID
      LEFT JOIN SeatStatus ss ON ss.ScheduleID = sch.ScheduleID AND ss.Status = 'Booked'
      WHERE src.CityName = ? AND dest.CityName = ?
    `;

    const params = [from, to];

    // Add date filter if provided
    if (date) {
      query += ` AND DATE(sch.DepartureTime) = ?`;
      params.push(date);
    }

    // Complete the query with proper GROUP BY
    query += `
      GROUP BY b.BusID, sch.ScheduleID, b.BusNumber, bt.TypeName, bt.Capacity,
               sch.DepartureTime, sch.ArrivalTime, src.CityName, dest.CityName,
               r.Distance, r.EstimatedTime, p.BasePrice
      HAVING BookedSeats < bt.Capacity
      ORDER BY sch.DepartureTime
    `;

    const [buses] = await pool.promise().query(query, params);

    // Render the booking page with the search results
    res.render("booking", {
      cities,
      routes,
      buses,
      selectedFrom: from,
      selectedTo: to,
      selectedDate: date,
      error: null,
    });
  } catch (error) {
    console.error("Error:", error);
    res.render("booking", {
      cities: [],
      routes: [],
      buses: [],
      error: "An error occurred while searching for buses",
    });
  }
});

app.get("/routes", (req, res) => {
  const query = `
    SELECT r.RouteID, c1.CityName AS Source, c2.CityName AS Destination, r.Distance, r.EstimatedTime
    FROM Routes r
    JOIN Cities c1 ON r.SourceCityID = c1.CityID
    JOIN Cities c2 ON r.DestinationCityID = c2.CityID
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching routes:", err);
      res.status(500).render("error", { message: "Error fetching routes" });
      return;
    }

    res.render("routes", { routes: results, user: req.session.user });
  });
});

app.get("/my-bookings", isAuthenticated, (req, res) => {
  const query = `
    SELECT b.BookingID, b.BookingDate, b.TotalAmount, b.Status,
           s.DepartureTime, s.ArrivalTime,
           c1.CityName as Source, c2.CityName as Destination,
           GROUP_CONCAT(p.Name) as Passengers
    FROM Bookings b
    JOIN Schedules s ON b.ScheduleID = s.ScheduleID
    JOIN Routes r ON s.RouteID = r.RouteID
    JOIN Cities c1 ON r.SourceCityID = c1.CityID
    JOIN Cities c2 ON r.DestinationCityID = c2.CityID
    LEFT JOIN Passengers p ON b.BookingID = p.BookingID
    WHERE b.UserID = ?
    GROUP BY b.BookingID
    ORDER BY b.BookingDate DESC
  `;

  pool.query(query, [req.session.userId], (err, results) => {
    if (err) {
      console.error("Error fetching bookings:", err);
      res.status(500).render("error", { message: "Error fetching bookings" });
      return;
    }
    res.render("my-bookings", { bookings: results, user: req.session.user });
  });
});

app.get("/profile", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("profile", { user: req.session.user });
});

app.get("/contact", (req, res) => {
  res.render("contact", { user: req.session.user });
});

// User Registration
app.get("/register", (req, res) => {
  res.render("register", { user: req.session.user });
});

app.post("/register", async (req, res) => {
  const { name, phone, email, password, role } = req.body;

  // Validate input
  if (!name || !phone || !email || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user already exists
    const checkQuery = "SELECT * FROM Users WHERE Email = ? OR PhoneNumber = ?";
    pool.query(checkQuery, [email, phone], (err, results) => {
      if (err) {
        return res.status(500).json({ error: "Registration failed" });
      }

      if (results.length > 0) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Create new user
      const query =
        "INSERT INTO Users (Name, PhoneNumber, Email, Password, Role) VALUES (?, ?, ?, ?, ?)";
      pool.query(
        query,
        [name, phone, email, hashedPassword, role],
        (err, result) => {
          if (err) {
            return res.status(500).json({ error: "Registration failed" });
          }

          // Get the newly created user
          const getUserQuery = "SELECT * FROM Users WHERE UserID = ?";
          pool.query(getUserQuery, [result.insertId], (err, userResults) => {
            if (err || userResults.length === 0) {
              return res
                .status(500)
                .json({ error: "Error retrieving user data" });
            }

            // Set user session
            req.session.userId = userResults[0].UserID;
            req.session.user = userResults[0];

            res.json({ message: "Registration successful" });
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// User Login
app.get("/login", (req, res) => {
  res.render("login", { user: req.session.user });
});

app.post("/login", (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "SELECT * FROM Users WHERE PhoneNumber = ?";
  pool.query(query, [phone], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = results[0];
    const passwordMatch = await bcrypt.compare(password, user.Password);

    if (passwordMatch) {
      req.session.userId = user.UserID;
      req.session.user = user;
      res.json({ message: "Login successful" });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
});

// Get Available Buses
app.get("/buses", (req, res) => {
  const { from, to, date } = req.query;

  // Validate input
  if (!from || !to || !date) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const query = `
    SELECT 
      s.ScheduleID,
      s.DepartureTime,
      s.ArrivalTime,
      b.BusID,
      b.BusNumber,
      bt.TypeName,
      bt.Capacity,
      r.RouteID,
      c1.CityName as SourceCity,
      c2.CityName as DestinationCity,
      r.Distance,
      r.EstimatedTime,
      p.BasePrice,
      COUNT(ss.SeatID) as AvailableSeats
    FROM Schedules s
    JOIN Buses b ON s.BusID = b.BusID
    JOIN BusTypes bt ON b.BusTypeID = bt.BusTypeID
    JOIN Routes r ON s.RouteID = r.RouteID
    JOIN Cities c1 ON r.SourceCityID = c1.CityID
    JOIN Cities c2 ON r.DestinationCityID = c2.CityID
    JOIN Pricing p ON r.RouteID = p.RouteID AND b.BusTypeID = p.BusTypeID
    LEFT JOIN Seats st ON b.BusID = st.BusID
    LEFT JOIN SeatStatus ss ON st.SeatID = ss.SeatID AND ss.Status = 'Available'
    WHERE c1.CityName = ? AND c2.CityName = ? AND DATE(s.DepartureTime) = ?
    GROUP BY s.ScheduleID, b.BusID, r.RouteID
    ORDER BY s.DepartureTime
  `;

  pool.query(query, [from, to, date], (err, results) => {
    if (err) {
      console.error("Error fetching buses:", err);
      return res.status(500).json({
        error: "Error fetching buses",
        details:
          process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "No buses found for the selected route and date",
      });
    }

    res.json(results);
  });
});

// Get seat availability
app.get("/api/seats/:busId", async (req, res) => {
  try {
    const busId = req.params.busId;
    const query =
      "SELECT SeatID, SeatNumber, Status FROM Seats WHERE BusID = ?";
    const [seats] = await pool.promise().query(query, [busId]);
    res.json(seats);
  } catch (error) {
    console.error("Error fetching seats:", error);
    res.status(500).json({ error: "Error fetching seats" });
  }
});

// Create booking route
app.post("/create-booking", isAuthenticated, async (req, res) => {
  try {
    const { scheduleId, passengers } = req.body;

    // Create a booking object
    const booking = {
      bookingId: Date.now().toString(),
      userId: req.session.userId,
      scheduleId,
      passengers,
      totalAmount: passengers.length * 500, // Fixed price for demo
      status: "pending",
      createdAt: new Date(),
    };

    // Store booking in memory
    bookings.push(booking);

    res.json({
      success: true,
      bookingId: booking.bookingId,
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: "Error creating booking",
    });
  }
});

// Payment page route
app.get("/payment", isAuthenticated, (req, res) => {
  const bookingId = req.query.bookingId;
  if (!bookingId) {
    return res.redirect("/error?message=No booking ID provided");
  }

  const booking = bookings.find((b) => b.bookingId === bookingId);
  if (!booking) {
    return res.redirect("/error?message=Booking not found");
  }

  res.render("payment", { booking });
});

// Process payment route
app.post("/process-payment", isAuthenticated, async (req, res) => {
  const connection = await pool.promise().getConnection();
  try {
    const { bookingId, paymentMethod } = req.body;

    // 1. Find the booking in memory
    const booking = bookings.find((b) => b.bookingId === bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // 2. Insert into Bookings table
    const [bookingResult] = await connection.query(
      "INSERT INTO Bookings (UserID, ScheduleID, BookingDate, TotalAmount, Status) VALUES (?, ?, NOW(), ?, ?)",
      [booking.userId, booking.scheduleId, booking.totalAmount, "confirmed"]
    );
    const dbBookingId = bookingResult.insertId;

    // 3. Insert each passenger
    for (const passenger of booking.passengers) {
      // Find SeatID for this seat number and bus
      const [seatRows] = await connection.query(
        `SELECT st.SeatID
         FROM Seats st
         JOIN Schedules sch ON st.BusID = sch.BusID
         WHERE sch.ScheduleID = ? AND st.SeatNumber = ?`,
        [booking.scheduleId, passenger.seatNumber]
      );
      if (!seatRows.length) throw new Error("Seat not found");

      const seatId = seatRows[0].SeatID;

      await connection.query(
        "INSERT INTO Passengers (BookingID, Name, Age, Gender, SeatID) VALUES (?, ?, ?, ?, ?)",
        [dbBookingId, passenger.name, passenger.age, passenger.gender, seatId]
      );
    }

    // 4. (Optional) Remove from in-memory array if you want
    // bookings = bookings.filter(b => b.bookingId !== bookingId);

    // 5. Redirect to confirmation page (use the DB BookingID)
    res.redirect(`/booking-confirmation/${bookingId}`);
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({
      success: false,
      message: "Error processing payment",
    });
  } finally {
    connection.release();
  }
});

// Booking confirmation route
app.get("/booking-confirmation/:bookingId", isAuthenticated, (req, res) => {
  const booking = bookings.find((b) => b.bookingId === req.params.bookingId);
  if (!booking) {
    return res.redirect("/error?message=Booking not found");
  }

  res.render("booking-confirmation", { booking });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/");
  });
});

// Admin Dashboard
app.get("/admin", isAdmin, async (req, res) => {
  try {
    // Fetch all required data
    const [bookings] = await pool.promise().query("SELECT * FROM Bookings");
    const [users] = await pool.promise().query("SELECT * FROM Users");
    const [buses] = await pool.promise().query("SELECT * FROM Buses");
    const [recentBookings] = await pool.promise().query(`
            SELECT b.*, u.Name as UserName, r.Source, r.Destination 
            FROM Bookings b 
            JOIN Users u ON b.UserID = u.UserID 
            JOIN Schedules s ON b.ScheduleID = s.ScheduleID 
            JOIN Routes r ON s.RouteID = r.RouteID 
            ORDER BY b.BookingDate DESC 
            LIMIT 5
        `);
    const [recentPayments] = await pool.promise().query(`
            SELECT p.*, b.BookingID 
            FROM Payments p 
            JOIN Bookings b ON p.BookingID = b.BookingID 
            ORDER BY p.PaymentDate DESC 
            LIMIT 5
        `);
    const [totalRevenueResult] = await pool.promise().query(`
            SELECT COALESCE(SUM(Amount), 0) as total 
            FROM Payments 
            WHERE Status = 'Completed'
        `);

    res.render("admin/dashboard", {
      user: req.session.user,
      bookings,
      users,
      buses,
      recentBookings,
      recentPayments,
      totalRevenue: totalRevenueResult[0].total,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).render("error", {
      message: "Error loading dashboard",
      error: error.message,
    });
  }
});

// Admin Bookings Management
app.get("/admin/bookings", isAdmin, async (req, res) => {
  try {
    const [bookings] = await pool.promise().query(`
            SELECT b.*, u.Name as UserName, r.Source, r.Destination, s.DepartureTime
            FROM Bookings b
            JOIN Users u ON b.UserID = u.UserID
            JOIN Schedules s ON b.ScheduleID = s.ScheduleID
            JOIN Routes r ON s.RouteID = r.RouteID
            ORDER BY b.BookingDate DESC
        `);
    res.render("admin/bookings", { bookings });
  } catch (error) {
    console.error("Error loading bookings:", error);
    res.redirect("/error?message=Error loading bookings");
  }
});

app.post("/admin/bookings/:id/cancel", isAdmin, async (req, res) => {
  try {
    const bookingId = req.params.id;
    await pool
      .promise()
      .query('UPDATE Bookings SET Status = "Cancelled" WHERE BookingID = ?', [
        bookingId,
      ]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to cancel booking" });
  }
});

// Admin Users Management
app.get("/admin/users", isAdmin, async (req, res) => {
  try {
    const [users] = await pool
      .promise()
      .query("SELECT * FROM Users ORDER BY UserID DESC");
    res.render("admin/users", { users });
  } catch (error) {
    console.error("Error loading users:", error);
    res.redirect("/error?message=Error loading users");
  }
});

app.post("/admin/users/:id/role", isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;
    await pool
      .promise()
      .query("UPDATE Users SET Role = ? WHERE UserID = ?", [role, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating user role:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update user role" });
  }
});

app.post("/admin/users/:id/status", isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { status } = req.body;
    await pool
      .promise()
      .query("UPDATE Users SET Status = ? WHERE UserID = ?", [status, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating user status:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update user status" });
  }
});

// Admin Payments Management
app.get("/admin/payments", isAdmin, (req, res) => {
  const query = `
        SELECT p.*, b.BookingID, u.Name as UserName
        FROM Payments p
        JOIN Bookings b ON p.BookingID = b.BookingID
        JOIN Users u ON b.UserID = u.UserID
        ORDER BY p.PaymentDate DESC
    `;

  pool.query(query, (err, payments) => {
    if (err) {
      console.error("Error fetching payments:", err);
      res.status(500).render("error", { message: "Error fetching payments" });
      return;
    }
    res.render("admin/payments", { payments });
  });
});

app.post("/admin/payments/:id/refund", isAdmin, async (req, res) => {
  try {
    const paymentId = req.params.id;
    await pool
      .promise()
      .query('UPDATE Payments SET Status = "Refunded" WHERE PaymentID = ?', [
        paymentId,
      ]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error processing refund:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to process refund" });
  }
});

// Admin Fares Management
app.get("/admin/fares", isAdmin, (req, res) => {
  const query = `
        SELECT s.*, r.Source, r.Destination, b.BusType
        FROM Schedules s
        JOIN Routes r ON s.RouteID = r.RouteID
        JOIN Buses b ON s.BusID = b.BusID
        ORDER BY s.DepartureTime DESC
    `;

  pool.query(query, (err, fares) => {
    if (err) {
      console.error("Error fetching fares:", err);
      res.status(500).render("error", { message: "Error fetching fares" });
      return;
    }
    res.render("admin/fares", { fares });
  });
});

app.post("/admin/fares/:id/update", isAdmin, async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const { price } = req.body;
    await pool
      .promise()
      .query("UPDATE Schedules SET Price = ? WHERE ScheduleID = ?", [
        price,
        scheduleId,
      ]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating fare:", error);
    res.status(500).json({ success: false, message: "Failed to update fare" });
  }
});

// Admin Routes Management
app.get("/admin/routes", isAdmin, async (req, res) => {
  try {
    const [routes] = await pool
      .promise()
      .query("SELECT * FROM Routes ORDER BY RouteID DESC");
    res.render("admin/routes", {
      routes,
      path: "/routes",
    });
  } catch (error) {
    console.error("Error loading routes:", error);
    res.redirect("/error?message=Error loading routes");
  }
});

app.post("/admin/routes", isAdmin, async (req, res) => {
  try {
    const { source, destination, distance, estimatedTime } = req.body;
    await pool
      .promise()
      .query(
        "INSERT INTO Routes (Source, Destination, Distance, EstimatedTime) VALUES (?, ?, ?, ?)",
        [source, destination, distance, estimatedTime]
      );
    res.json({ success: true });
  } catch (error) {
    console.error("Error adding route:", error);
    res.status(500).json({ error: "Failed to add route" });
  }
});

app.delete("/admin/routes/:id", isAdmin, async (req, res) => {
  try {
    await pool
      .promise()
      .query("DELETE FROM Routes WHERE RouteID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting route:", error);
    res.status(500).json({ error: "Failed to delete route" });
  }
});

// Admin Buses Management
app.get("/admin/buses", isAdmin, async (req, res) => {
  try {
    const [buses] = await pool.promise().query(`
            SELECT b.*, bs.Status 
            FROM Buses b 
            LEFT JOIN BusStatus bs ON b.BusID = bs.BusID 
            ORDER BY b.BusID DESC
        `);
    res.render("admin/buses", { buses });
  } catch (error) {
    console.error("Error loading buses:", error);
    res.redirect("/error?message=Error loading buses");
  }
});

app.post("/admin/buses", isAdmin, async (req, res) => {
  try {
    const { busNumber, busType, capacity, status } = req.body;

    // Check if bus number already exists
    const [existingBus] = await pool
      .promise()
      .query("SELECT * FROM Buses WHERE BusNumber = ?", [busNumber]);

    if (existingBus.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Bus number already exists",
      });
    }

    // Insert new bus
    await pool
      .promise()
      .query(
        "INSERT INTO Buses (BusNumber, BusType, Capacity) VALUES (?, ?, ?)",
        [busNumber, busType, capacity]
      );

    // Get the newly inserted bus ID
    const [result] = await pool
      .promise()
      .query("SELECT LAST_INSERT_ID() as busId");
    const busId = result[0].busId;

    // Create seat entries based on capacity
    const seatLetters = ["A", "B", "C", "D", "E", "F"];
    const seatsPerRow = busType.includes("Sleeper") ? 3 : 4;
    const rows = Math.ceil(capacity / seatsPerRow);

    for (let row = 1; row <= rows; row++) {
      for (let seat = 0; seat < seatsPerRow; seat++) {
        if ((row - 1) * seatsPerRow + seat < capacity) {
          const seatNumber = `${seatLetters[seat]}${row}`;
          await pool
            .promise()
            .query(
              'INSERT INTO Seats (BusID, SeatNumber, Status) VALUES (?, ?, "Available")',
              [busId, seatNumber]
            );
        }
      }
    }

    // Insert initial bus status
    await pool
      .promise()
      .query(
        "INSERT INTO BusStatus (BusID, CurrentLocation, NextStop, Status) VALUES (?, ?, ?, ?)",
        [busId, "Not Started", "Not Started", status || "OnTime"]
      );

    res.json({ success: true });
  } catch (error) {
    console.error("Error adding bus:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add bus",
    });
  }
});

app.put("/admin/buses/:id", isAdmin, async (req, res) => {
  try {
    const { busNumber, busType, capacity, status } = req.body;

    // Check if bus number already exists for different bus
    const [existingBus] = await pool
      .promise()
      .query("SELECT * FROM Buses WHERE BusNumber = ? AND BusID != ?", [
        busNumber,
        req.params.id,
      ]);

    if (existingBus.length > 0) {
      return res.json({ success: false, message: "Bus number already exists" });
    }

    // Update bus details
    await pool
      .promise()
      .query(
        "UPDATE Buses SET BusNumber = ?, BusType = ?, Capacity = ? WHERE BusID = ?",
        [busNumber, busType, capacity, req.params.id]
      );

    // Update bus status
    await pool
      .promise()
      .query("UPDATE BusStatus SET Status = ? WHERE BusID = ?", [
        status,
        req.params.id,
      ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to update bus" });
  }
});

app.delete("/admin/buses/:id", isAdmin, async (req, res) => {
  try {
    await pool
      .promise()
      .query("DELETE FROM Buses WHERE BusID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting bus:", error);
    res.status(500).json({ error: "Failed to delete bus" });
  }
});

// Admin Schedules Management
app.get("/admin/schedules", isAdmin, (req, res) => {
  const query = `
        SELECT s.*, r.Source, r.Destination, b.BusNumber, b.BusType
        FROM Schedules s
        JOIN Routes r ON s.RouteID = r.RouteID
        JOIN Buses b ON s.BusID = b.BusID
        ORDER BY s.DepartureTime DESC
    `;

  pool.query(query, (err, schedules) => {
    if (err) {
      console.error("Error fetching schedules:", err);
      res.status(500).render("error", { message: "Error fetching schedules" });
      return;
    }

    // Get routes and buses for the form
    const routesQuery = "SELECT * FROM Routes";
    const busesQuery = `
            SELECT b.*, bs.Status 
            FROM Buses b 
            LEFT JOIN BusStatus bs ON b.BusID = bs.BusID 
            WHERE bs.Status = 'OnTime' OR bs.Status IS NULL
        `;

    pool.query(routesQuery, (err, routes) => {
      if (err) {
        console.error("Error fetching routes:", err);
        res.status(500).render("error", { message: "Error fetching routes" });
        return;
      }

      pool.query(busesQuery, (err, buses) => {
        if (err) {
          console.error("Error fetching buses:", err);
          res.status(500).render("error", { message: "Error fetching buses" });
          return;
        }

        res.render("admin/schedules", { schedules, routes, buses });
      });
    });
  });
});

app.post("/admin/schedules", isAdmin, async (req, res) => {
  try {
    const { routeId, busId, departureTime, price } = req.body;

    // Get route duration
    const [routeResult] = await pool
      .promise()
      .query("SELECT EstimatedTime FROM Routes WHERE RouteID = ?", [routeId]);

    if (!routeResult.length) {
      throw new Error("Route not found");
    }

    // Calculate arrival time
    const departure = new Date(departureTime);
    const [hours, minutes] = routeResult[0].EstimatedTime.split(":");
    const arrival = new Date(
      departure.getTime() + (hours * 60 + parseInt(minutes)) * 60000
    );

    await pool
      .promise()
      .query(
        "INSERT INTO Schedules (RouteID, BusID, DepartureTime, ArrivalTime, Price) VALUES (?, ?, ?, ?, ?)",
        [routeId, busId, departure, arrival, price]
      );

    res.json({ success: true });
  } catch (error) {
    console.error("Error adding schedule:", error);
    res.status(500).json({ error: "Failed to add schedule" });
  }
});

app.delete("/admin/schedules/:id", isAdmin, async (req, res) => {
  try {
    await pool
      .promise()
      .query("DELETE FROM Schedules WHERE ScheduleID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({ error: "Failed to delete schedule" });
  }
});

// Create Admin User (Remove this route after creating admin)
app.get("/create-admin", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const adminUser = {
      Name: "Admin User",
      PhoneNumber: "9999999999",
      Email: "admin@busgo.com",
      Password: hashedPassword,
      Role: "admin",
    };

    const checkQuery = "SELECT * FROM Users WHERE Email = ? OR PhoneNumber = ?";
    const [existing] = await pool
      .promise()
      .query(checkQuery, [adminUser.Email, adminUser.PhoneNumber]);

    if (existing.length > 0) {
      return res.send("Admin user already exists");
    }

    await pool
      .promise()
      .query(
        "INSERT INTO Users (Name, PhoneNumber, Email, Password, Role) VALUES (?, ?, ?, ?, ?)",
        [
          adminUser.Name,
          adminUser.PhoneNumber,
          adminUser.Email,
          adminUser.Password,
          adminUser.Role,
        ]
      );

    res.send("Admin user created successfully");
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).send("Error creating admin user");
  }
});

// Admin Login Routes
app.get("/admin/login", (req, res) => {
  if (req.session.isAdmin) {
    res.redirect("/admin");
  } else {
    res.render("admin/login");
  }
});

app.post("/admin/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both phone number and password",
      });
    }

    const query =
      'SELECT * FROM Users WHERE PhoneNumber = ? AND Role = "admin"';
    const [admin] = await pool.promise().query(query, [phone]);

    if (admin.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isValidPassword = await bcrypt.compare(password, admin[0].Password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Set admin session
    req.session.isAdmin = true;
    req.session.adminId = admin[0].UserID;
    req.session.adminName = admin[0].Name;

    res.json({
      success: true,
      redirect: "/admin",
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during login",
    });
  }
});

// Admin logout
app.get("/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/admin/login");
  });
});

// Get booking details
app.get("/admin/bookings/:id", isAdmin, async (req, res) => {
  try {
    const bookingId = req.params.id;

    // Get booking details with user and schedule information
    const [booking] = await pool.promise().query(
      `
            SELECT b.*, 
                   u.Name as UserName, 
                   u.PhoneNumber as UserPhone, 
                   u.Email as UserEmail,
                   r.Source, 
                   r.Destination,
                   s.DepartureTime,
                   s.ArrivalTime
            FROM Bookings b
            JOIN Users u ON b.UserID = u.UserID
            JOIN Schedules s ON b.ScheduleID = s.ScheduleID
            JOIN Routes r ON s.RouteID = r.RouteID
            WHERE b.BookingID = ?
        `,
      [bookingId]
    );

    if (!booking || booking.length === 0) {
      return res.status(404).send("Booking not found");
    }

    // Get passenger details for this booking
    const [passengers] = await pool.promise().query(
      `
            SELECT p.*
            FROM Passengers p
            WHERE p.BookingID = ?
        `,
      [bookingId]
    );

    // Combine the data
    const bookingDetails = {
      ...booking[0],
      passengers: passengers,
    };

    res.render("admin/booking-details", { booking: bookingDetails });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    res.status(500).send("Error fetching booking details");
  }
});

// Get payment details
app.get("/admin/payments/:id", isAdmin, async (req, res) => {
  try {
    const paymentId = req.params.id;

    // Get payment details with booking and user information
    const [payment] = await pool.promise().query(
      `
            SELECT p.*, 
                   b.BookingID,
                   b.Status as BookingStatus,
                   u.Name as UserName,
                   u.PhoneNumber as UserPhone,
                   u.Email as UserEmail,
                   r.Source,
                   r.Destination,
                   s.DepartureTime,
                   s.ArrivalTime,
                   s.Price as SchedulePrice
            FROM Payments p
            JOIN Bookings b ON p.BookingID = b.BookingID
            JOIN Users u ON b.UserID = u.UserID
            JOIN Schedules s ON b.ScheduleID = s.ScheduleID
            JOIN Routes r ON s.RouteID = r.RouteID
            WHERE p.TransactionID = ?
        `,
      [paymentId]
    );

    if (!payment || payment.length === 0) {
      return res.status(404).render("error", { message: "Payment not found" });
    }

    // Format dates
    const paymentDetails = {
      ...payment[0],
      PaymentDate: new Date(payment[0].PaymentDate).toLocaleString(),
      DepartureTime: new Date(payment[0].DepartureTime).toLocaleString(),
      ArrivalTime: new Date(payment[0].ArrivalTime).toLocaleString(),
    };

    res.render("admin/payment-details", { payment: paymentDetails });
  } catch (error) {
    console.error("Error fetching payment details:", error);
    res
      .status(500)
      .render("error", { message: "Error fetching payment details" });
  }
});

// User Management Routes
app.get("/admin/users/:id", isAdmin, async (req, res) => {
  try {
    const [user] = await pool.query("SELECT * FROM Users WHERE UserID = ?", [
      req.params.id,
    ]);
    if (user.length === 0) {
      return res.status(404).render("error", { message: "User not found" });
    }
    res.render("admin/user-details", { user: user[0] });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).render("error", { message: "Internal server error" });
  }
});

app.put("/admin/users/:id", isAdmin, async (req, res) => {
  try {
    const { role, status } = req.body;
    await pool.query("UPDATE Users SET Role = ?, Status = ? WHERE UserID = ?", [
      role,
      status,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to update user" });
  }
});

app.delete("/admin/users/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM Users WHERE UserID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to delete user" });
  }
});

// Route Management Routes
app.post("/admin/routes", isAdmin, async (req, res) => {
  try {
    const { source, destination, distance, estimatedTime } = req.body;
    await pool.query(
      "INSERT INTO Routes (Source, Destination, Distance, EstimatedTime) VALUES (?, ?, ?, ?)",
      [source, destination, distance, estimatedTime]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to add route" });
  }
});

app.put("/admin/routes/:id", isAdmin, async (req, res) => {
  try {
    const { source, destination, distance, estimatedTime } = req.body;
    await pool.query(
      "UPDATE Routes SET Source = ?, Destination = ?, Distance = ?, EstimatedTime = ? WHERE RouteID = ?",
      [source, destination, distance, estimatedTime, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to update route" });
  }
});

app.delete("/admin/routes/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM Routes WHERE RouteID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to delete route" });
  }
});

// Bus Management Routes
app.post("/admin/buses", isAdmin, async (req, res) => {
  try {
    const { busNumber, busType, capacity, status } = req.body;

    // Check if bus number already exists
    const [existingBus] = await pool
      .promise()
      .query("SELECT * FROM Buses WHERE BusNumber = ?", [busNumber]);

    if (existingBus.length > 0) {
      return res.json({ success: false, message: "Bus number already exists" });
    }

    await pool
      .promise()
      .query(
        "INSERT INTO Buses (BusNumber, BusType, Capacity) VALUES (?, ?, ?)",
        [busNumber, busType, capacity]
      );

    // Get the newly inserted bus ID
    const [result] = await pool
      .promise()
      .query("SELECT LAST_INSERT_ID() as busId");
    const busId = result[0].busId;

    // Create seat entries based on capacity
    const seatLetters = ["A", "B", "C", "D", "E", "F"];
    const seatsPerRow = busType.includes("Sleeper") ? 3 : 4;
    const rows = Math.ceil(capacity / seatsPerRow);

    for (let row = 1; row <= rows; row++) {
      for (let seat = 0; seat < seatsPerRow; seat++) {
        if ((row - 1) * seatsPerRow + seat < capacity) {
          const seatNumber = `${seatLetters[seat]}${row}`;
          await pool
            .promise()
            .query(
              'INSERT INTO Seats (BusID, SeatNumber, Status) VALUES (?, ?, "Available")',
              [busId, seatNumber]
            );
        }
      }
    }

    // Insert initial bus status
    await pool
      .promise()
      .query(
        "INSERT INTO BusStatus (BusID, CurrentLocation, NextStop, Status) VALUES (?, ?, ?, ?)",
        [busId, "Not Started", "Not Started", status || "OnTime"]
      );

    res.json({ success: true });
  } catch (error) {
    console.error("Error adding bus:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add bus",
    });
  }
});

app.put("/admin/buses/:id", isAdmin, async (req, res) => {
  try {
    const { busNumber, busType, capacity, status } = req.body;

    // Check if bus number already exists for different bus
    const [existingBus] = await pool
      .promise()
      .query("SELECT * FROM Buses WHERE BusNumber = ? AND BusID != ?", [
        busNumber,
        req.params.id,
      ]);

    if (existingBus.length > 0) {
      return res.json({ success: false, message: "Bus number already exists" });
    }

    // Update bus details
    await pool
      .promise()
      .query(
        "UPDATE Buses SET BusNumber = ?, BusType = ?, Capacity = ? WHERE BusID = ?",
        [busNumber, busType, capacity, req.params.id]
      );

    // Update bus status
    await pool
      .promise()
      .query("UPDATE BusStatus SET Status = ? WHERE BusID = ?", [
        status,
        req.params.id,
      ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to update bus" });
  }
});

app.delete("/admin/buses/:id", isAdmin, async (req, res) => {
  try {
    await pool
      .promise()
      .query("DELETE FROM Buses WHERE BusID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.json({ success: false, message: "Failed to delete bus" });
  }
});

// Admin Schedules Management
app.get("/admin/schedules", isAdmin, (req, res) => {
  const query = `
        SELECT s.*, r.Source, r.Destination, b.BusNumber, b.BusType
        FROM Schedules s
        JOIN Routes r ON s.RouteID = r.RouteID
        JOIN Buses b ON s.BusID = b.BusID
        ORDER BY s.DepartureTime DESC
    `;

  pool.query(query, (err, schedules) => {
    if (err) {
      console.error("Error fetching schedules:", err);
      res.status(500).render("error", { message: "Error fetching schedules" });
      return;
    }

    // Get routes and buses for the form
    const routesQuery = "SELECT * FROM Routes";
    const busesQuery = `
            SELECT b.*, bs.Status 
            FROM Buses b 
            LEFT JOIN BusStatus bs ON b.BusID = bs.BusID 
            WHERE bs.Status = 'OnTime' OR bs.Status IS NULL
        `;

    pool.query(routesQuery, (err, routes) => {
      if (err) {
        console.error("Error fetching routes:", err);
        res.status(500).render("error", { message: "Error fetching routes" });
        return;
      }

      pool.query(busesQuery, (err, buses) => {
        if (err) {
          console.error("Error fetching buses:", err);
          res.status(500).render("error", { message: "Error fetching buses" });
          return;
        }

        res.render("admin/schedules", { schedules, routes, buses });
      });
    });
  });
});

app.post("/admin/schedules", isAdmin, async (req, res) => {
  try {
    const { routeId, busId, departureTime, price } = req.body;

    // Get route duration
    const [routeResult] = await pool
      .promise()
      .query("SELECT EstimatedTime FROM Routes WHERE RouteID = ?", [routeId]);

    if (!routeResult.length) {
      throw new Error("Route not found");
    }

    // Calculate arrival time
    const departure = new Date(departureTime);
    const [hours, minutes] = routeResult[0].EstimatedTime.split(":");
    const arrival = new Date(
      departure.getTime() + (hours * 60 + parseInt(minutes)) * 60000
    );

    await pool
      .promise()
      .query(
        "INSERT INTO Schedules (RouteID, BusID, DepartureTime, ArrivalTime, Price) VALUES (?, ?, ?, ?, ?)",
        [routeId, busId, departure, arrival, price]
      );

    res.json({ success: true });
  } catch (error) {
    console.error("Error adding schedule:", error);
    res.status(500).json({ error: "Failed to add schedule" });
  }
});

app.delete("/admin/schedules/:id", isAdmin, async (req, res) => {
  try {
    await pool
      .promise()
      .query("DELETE FROM Schedules WHERE ScheduleID = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({ error: "Failed to delete schedule" });
  }
});

// New Routes for Additional Tables

// Route Booking API for routes.ejs modal
app.post("/api/route-booking", (req, res) => {
  try {
    const { source, destination, seats, pricePerSeat, totalPrice, scheduleId } =
      req.body;

    // Basic validation
    if (
      !source ||
      !destination ||
      !Array.isArray(seats) ||
      seats.length === 0 ||
      !scheduleId
    ) {
      return res.status(400).json({ error: "Invalid booking data" });
    }

    // Generate a bookingId (for demo, use timestamp + random)
    const bookingId = Date.now().toString() + Math.floor(Math.random() * 1000);

    // Store booking in memory (expand to DB as needed)
    bookings.push({
      bookingId,
      userId: req.session.userId,
      scheduleId,
      source,
      destination,
      seats,
      pricePerSeat,
      totalAmount: totalPrice,
      status: "pending",
      createdAt: new Date(),
    });

    // Respond with bookingId
    res.json({ bookingId });
  } catch (error) {
    console.error("Error in /api/route-booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/bus-types", (req, res) => {
  pool.query("SELECT * FROM BusTypes", (err, results) => {
    if (err) {
      console.error("Error fetching bus types:", err);
      res.status(500).json({ error: "Error fetching bus types" });
      return;
    }
    res.json(results);
  });
});

app.get("/api/cities", (req, res) => {
  pool.query("SELECT * FROM Cities", (err, results) => {
    if (err) {
      res.status(500).json({ error: "Error fetching cities" });
      return;
    }
    res.json(results);
  });
});

app.get("/api/routes", (req, res) => {
  pool.query(
    `
    SELECT r.*, c1.CityName as SourceCity, c2.CityName as DestinationCity
    FROM Routes r
    JOIN Cities c1 ON r.SourceCityID = c1.CityID
    JOIN Cities c2 ON r.DestinationCityID = c2.CityID
  `,
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching routes" });
        return;
      }
      res.json(results);
    }
  );
});

app.get("/api/buses", (req, res) => {
  pool.query(
    `
    SELECT b.*, bt.TypeName, bt.Capacity
    FROM Buses b
    JOIN BusTypes bt ON b.BusTypeID = bt.BusTypeID
  `,
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching buses" });
        return;
      }
      res.json(results);
    }
  );
});

app.get("/api/schedules", (req, res) => {
  pool.query(
    `
    SELECT s.*, b.BusNumber, r.SourceCityID, r.DestinationCityID
    FROM Schedules s
    JOIN Buses b ON s.BusID = b.BusID
    JOIN Routes r ON s.RouteID = r.RouteID
  `,
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching schedules" });
        return;
      }
      res.json(results);
    }
  );
});

app.get("/api/seats", (req, res) => {
  pool.query(
    `
    SELECT s.*, ss.Status
    FROM Seats s
    LEFT JOIN SeatStatus ss ON s.SeatID = ss.SeatID
  `,
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching seats" });
        return;
      }
      res.json(results);
    }
  );
});

app.get("/api/bookings", isAuthenticated, (req, res) => {
  pool.query(
    `
    SELECT b.*, u.Name as UserName, s.DepartureTime, s.ArrivalTime
    FROM Bookings b
    JOIN Users u ON b.UserID = u.UserID
    JOIN Schedules s ON b.ScheduleID = s.ScheduleID
    WHERE b.UserID = ?
  `,
    [req.session.userId],
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching bookings" });
        return;
      }
      res.json(results);
    }
  );
});

app.get("/api/passengers/:bookingId", isAuthenticated, (req, res) => {
  pool.query(
    `
    SELECT p.*, s.SeatNumber
    FROM Passengers p
    JOIN Seats s ON p.SeatID = s.SeatID
    WHERE p.BookingID = ?
  `,
    [req.params.bookingId],
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching passengers" });
        return;
      }
      res.json(results);
    }
  );
});

app.get("/api/payments/:bookingId", isAuthenticated, (req, res) => {
  pool.query(
    `
    SELECT p.*
    FROM Payments p
    WHERE p.BookingID = ?
  `,
    [req.params.bookingId],
    (err, results) => {
      if (err) {
        res.status(500).json({ error: "Error fetching payments" });
        return;
      }
      res.json(results);
    }
  );
});

// Get route price
app.get("/api/route-price", async (req, res) => {
  try {
    const { from, to } = req.query;

    // Query to get the base price for the route
    const [priceResult] = await pool.promise().query(
      `
            SELECT p.BasePrice
            FROM Pricing p
            JOIN Routes r ON p.RouteID = r.RouteID
            JOIN Cities c1 ON r.SourceCityID = c1.CityID
            JOIN Cities c2 ON r.DestinationCityID = c2.CityID
            WHERE c1.CityName = ? AND c2.CityName = ?
            LIMIT 1
        `,
      [from, to]
    );

    if (priceResult.length > 0) {
      res.json({ price: priceResult[0].BasePrice });
    } else {
      res.json({ price: 500 }); // Default price if not found
    }
  } catch (error) {
    console.error("Error fetching route price:", error);
    res.status(500).json({ error: "Error fetching route price" });
  }
});

// Get unavailable seats for a route
app.get("/api/unavailable-seats", async (req, res) => {
  try {
    const { from, to } = req.query;

    // Query to get unavailable seats for the route
    const [seatsResult] = await pool.promise().query(
      `
        SELECT s.SeatNumber
        FROM Bookings b
        JOIN Passengers p ON b.BookingID = p.BookingID
        JOIN Seats s ON p.SeatID = s.SeatID
        JOIN Schedules sch ON b.ScheduleID = sch.ScheduleID
        JOIN Routes r ON sch.RouteID = r.RouteID
        JOIN Cities c1 ON r.SourceCityID = c1.CityID
        JOIN Cities c2 ON r.DestinationCityID = c2.CityID
        WHERE c1.CityName = ? AND c2.CityName = ?
        AND b.Status = 'Confirmed'
    `,
      [from, to]
    );

    const unavailableSeats = seatsResult.map((row) => row.SeatNumber);
    res.json({ unavailableSeats });
  } catch (error) {
    console.error("Error fetching unavailable seats:", error);
    res.status(500).json({ error: "Error fetching unavailable seats" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error", {
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

app.get("/select-seats/:scheduleId", async (req, res) => {
  const scheduleId = req.params.scheduleId;
  // Fetch bus, schedule, and seat info for this scheduleId
  // Example:
  const [scheduleRows] = await pool.promise().query(
    `SELECT s.*, b.BusNumber, bt.TypeName, bt.Capacity, r.Distance, r.EstimatedTime
     FROM Schedules s
     JOIN Buses b ON s.BusID = b.BusID
     JOIN BusTypes bt ON b.BusTypeID = bt.BusTypeID
     JOIN Routes r ON s.RouteID = r.RouteID
     WHERE s.ScheduleID = ?`,
    [scheduleId]
  );
  const [seats] = await pool.promise().query(
    `SELECT st.SeatID, st.SeatNumber, IFNULL(ss.Status, 'Available') as Status
     FROM Seats st
     LEFT JOIN SeatStatus ss ON st.SeatID = ss.SeatID AND ss.ScheduleID = ?
     WHERE st.BusID = ?`,
    [scheduleId, scheduleRows[0].BusID]
  );
  res.render("select-seats", {
    schedule: scheduleRows[0],
    seats,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
