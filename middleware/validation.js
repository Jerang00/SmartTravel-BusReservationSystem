const { body, validationResult } = require("express-validator");

const validateRegistration = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("phone")
    .matches(/^[0-9]{10}$/)
    .withMessage("Valid phone number is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("role")
    .isIn(["Passenger", "BusOperator", "Driver"])
    .withMessage("Invalid role"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];


const validateBooking = [
  body("scheduleId").isInt().withMessage("Valid schedule ID is required"),
  body("passengers").isArray().withMessage("Passengers must be an array"),
  body("passengers.*.name")
    .trim()
    .notEmpty()
    .withMessage("Passenger name is required"),
  body("passengers.*.age")
    .isInt({ min: 1, max: 120 })
    .withMessage("Valid age is required"),
  body("passengers.*.gender")
    .isIn(["Male", "Female", "Other"])
    .withMessage("Invalid gender"),
  body("passengers.*.seatId").isInt().withMessage("Valid seat ID is required"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];


const validatePayment = [
  body("bookingId").isInt().withMessage("Valid booking ID is required"),
  body("amount").isFloat({ min: 0 }).withMessage("Valid amount is required"),
  body("paymentMethod")
    .isIn(["Credit Card", "Debit Card", "UPI", "Net Banking"])
    .withMessage("Invalid payment method"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

module.exports = {
  validateRegistration,
  validateBooking,
  validatePayment,
};
