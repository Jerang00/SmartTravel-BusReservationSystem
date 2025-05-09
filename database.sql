-- Create the database
DROP DATABASE IF EXISTS bus;
CREATE DATABASE bus;
USE bus;

-- 1NF Tables
CREATE TABLE BusTypes (
    BusTypeID INT PRIMARY KEY AUTO_INCREMENT,
    TypeName VARCHAR(50) NOT NULL,
    Capacity INT NOT NULL
);

CREATE TABLE Users (
    UserID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(100) NOT NULL,
    Email VARCHAR(100) UNIQUE NOT NULL,
    PhoneNumber VARCHAR(15) NOT NULL,
    Password VARCHAR(100) NOT NULL,
    Role ENUM('Passenger', 'BusOperator', 'Driver') NOT NULL
);

-- 2NF Tables
CREATE TABLE Buses (
    BusID INT PRIMARY KEY AUTO_INCREMENT,
    BusNumber VARCHAR(20) NOT NULL,
    BusTypeID INT NOT NULL,
    OperatorID INT,
    FOREIGN KEY (BusTypeID) REFERENCES BusTypes(BusTypeID),
    FOREIGN KEY (OperatorID) REFERENCES Users(UserID)
);

CREATE TABLE Cities (
    CityID INT PRIMARY KEY AUTO_INCREMENT,
    CityName VARCHAR(100) NOT NULL,
    State VARCHAR(50) NOT NULL,
    Country VARCHAR(50) NOT NULL
);

CREATE TABLE Routes (
    RouteID INT PRIMARY KEY AUTO_INCREMENT,
    SourceCityID INT NOT NULL,
    DestinationCityID INT NOT NULL,
    Distance INT NOT NULL,
    EstimatedTime TIME NOT NULL,
    FOREIGN KEY (SourceCityID) REFERENCES Cities(CityID),
    FOREIGN KEY (DestinationCityID) REFERENCES Cities(CityID)
);

-- 3NF Tables
CREATE TABLE BusIdentifiers (
    BusNumber VARCHAR(20) PRIMARY KEY,
    BusID INT NOT NULL,
    RegistrationDate DATE NOT NULL,
    FOREIGN KEY (BusID) REFERENCES Buses(BusID)
);

CREATE TABLE Drivers (
    DriverID INT PRIMARY KEY AUTO_INCREMENT,
    UserID INT NOT NULL,
    LicenseNumber VARCHAR(50) NOT NULL,
    LicenseExpiry DATE NOT NULL,
    YearsOfExperience INT,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

-- BCNF Tables
CREATE TABLE DriverRoutes (
    AssignmentID INT PRIMARY KEY AUTO_INCREMENT,
    DriverID INT NOT NULL,
    RouteID INT NOT NULL,
    ValidFrom DATE NOT NULL,
    ValidTo DATE,
    UNIQUE (DriverID, RouteID, ValidFrom),
    FOREIGN KEY (DriverID) REFERENCES Drivers(DriverID),
    FOREIGN KEY (RouteID) REFERENCES Routes(RouteID)
);

CREATE TABLE BusDrivers (
    AssignmentID INT PRIMARY KEY AUTO_INCREMENT,
    BusID INT NOT NULL,
    DriverID INT NOT NULL,
    AssignmentDate DATE NOT NULL,
    IsActive BOOLEAN DEFAULT TRUE,
    UNIQUE (BusID, DriverID, AssignmentDate),
    FOREIGN KEY (BusID) REFERENCES Buses(BusID),
    FOREIGN KEY (DriverID) REFERENCES Drivers(DriverID)
);

-- 4NF Tables
CREATE TABLE Amenities (
    AmenityID INT PRIMARY KEY AUTO_INCREMENT,
    AmenityName VARCHAR(50) NOT NULL,
    Description TEXT
);

CREATE TABLE Features (
    FeatureID INT PRIMARY KEY AUTO_INCREMENT,
    FeatureName VARCHAR(50) NOT NULL,
    Description TEXT
);

CREATE TABLE BusAmenities (
    BusID INT NOT NULL,
    AmenityID INT NOT NULL,
    PRIMARY KEY (BusID, AmenityID),
    FOREIGN KEY (BusID) REFERENCES Buses(BusID),
    FOREIGN KEY (AmenityID) REFERENCES Amenities(AmenityID)
);

CREATE TABLE BusFeatures (
    BusID INT NOT NULL,
    FeatureID INT NOT NULL,
    PRIMARY KEY (BusID, FeatureID),
    FOREIGN KEY (BusID) REFERENCES Buses(BusID),
    FOREIGN KEY (FeatureID) REFERENCES Features(FeatureID)
);

-- 5NF Tables
CREATE TABLE RouteSegments (
    RouteID INT NOT NULL,
    SegmentID INT NOT NULL,
    SequenceNumber INT NOT NULL,
    PRIMARY KEY (RouteID, SegmentID),
    FOREIGN KEY (RouteID) REFERENCES Routes(RouteID)
);

CREATE TABLE SegmentCities (
    SegmentID INT NOT NULL,
    CityID INT NOT NULL,
    PRIMARY KEY (SegmentID, CityID),
    FOREIGN KEY (CityID) REFERENCES Cities(CityID)
);

-- 1NF Tables (after dependencies)
CREATE TABLE Seats (
    SeatID INT PRIMARY KEY AUTO_INCREMENT,
    BusID INT,
    SeatNumber VARCHAR(10) NOT NULL,
    FOREIGN KEY (BusID) REFERENCES Buses(BusID)
);

CREATE TABLE Schedules (
    ScheduleID INT PRIMARY KEY AUTO_INCREMENT,
    BusID INT NOT NULL,
    RouteID INT NOT NULL,
    DepartureTime TIME NOT NULL,
    ArrivalTime TIME NOT NULL,
    FOREIGN KEY (BusID) REFERENCES Buses(BusID),
    FOREIGN KEY (RouteID) REFERENCES Routes(RouteID)
);

CREATE TABLE SeatStatus (
    StatusID INT PRIMARY KEY AUTO_INCREMENT,
    SeatID INT NOT NULL,
    ScheduleID INT NOT NULL,
    Status ENUM('Available', 'Booked', 'Reserved') NOT NULL,
    FOREIGN KEY (SeatID) REFERENCES Seats(SeatID),
    FOREIGN KEY (ScheduleID) REFERENCES Schedules(ScheduleID)
);

CREATE TABLE Bookings (
    BookingID INT PRIMARY KEY AUTO_INCREMENT,
    UserID INT NOT NULL,
    ScheduleID INT NOT NULL,
    BookingDate DATETIME NOT NULL,
    TotalAmount DECIMAL(10,2) NOT NULL,
    Status ENUM('Confirmed', 'Cancelled', 'Pending') NOT NULL,
    FOREIGN KEY (UserID) REFERENCES Users(UserID),
    FOREIGN KEY (ScheduleID) REFERENCES Schedules(ScheduleID)
);

CREATE TABLE Passengers (
    PassengerID INT PRIMARY KEY AUTO_INCREMENT,
    BookingID INT NOT NULL,
    Name VARCHAR(100) NOT NULL,
    Age INT NOT NULL,
    Gender ENUM('Male', 'Female', 'Other') NOT NULL,
    SeatID INT NOT NULL,
    FOREIGN KEY (BookingID) REFERENCES Bookings(BookingID),
    FOREIGN KEY (SeatID) REFERENCES Seats(SeatID)
);

CREATE TABLE Payments (
    PaymentID INT PRIMARY KEY AUTO_INCREMENT,
    BookingID INT NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    PaymentDate DATETIME NOT NULL,
    PaymentMethod ENUM('Credit Card', 'Debit Card', 'UPI', 'Net Banking') NOT NULL,
    Status ENUM('Success', 'Failed', 'Pending') NOT NULL,
    FOREIGN KEY (BookingID) REFERENCES Bookings(BookingID)
);

CREATE TABLE Reviews (
    ReviewID INT PRIMARY KEY AUTO_INCREMENT,
    UserID INT NOT NULL,
    BusID INT NOT NULL,
    Rating INT NOT NULL CHECK (Rating BETWEEN 1 AND 5),
    Comment TEXT,
    ReviewDate DATETIME NOT NULL,
    FOREIGN KEY (UserID) REFERENCES Users(UserID),
    FOREIGN KEY (BusID) REFERENCES Buses(BusID)
);

CREATE TABLE BusStops (
    StopID INT PRIMARY KEY AUTO_INCREMENT,
    RouteID INT NOT NULL,
    CityID INT NOT NULL,
    StopOrder INT NOT NULL,
    ArrivalTime TIME NOT NULL,
    DepartureTime TIME NOT NULL,
    FOREIGN KEY (RouteID) REFERENCES Routes(RouteID),
    FOREIGN KEY (CityID) REFERENCES Cities(CityID)
);

CREATE TABLE BusStatus (
    StatusID INT PRIMARY KEY AUTO_INCREMENT,
    BusID INT NOT NULL,
    Status ENUM('Active', 'Maintenance', 'Out of Service') NOT NULL,
    LastUpdated DATETIME NOT NULL,
    FOREIGN KEY (BusID) REFERENCES Buses(BusID)
);

CREATE TABLE ScheduleDrivers (
    AssignmentID INT PRIMARY KEY AUTO_INCREMENT,
    ScheduleID INT NOT NULL,
    DriverID INT NOT NULL,
    AssignmentDate DATE NOT NULL,
    FOREIGN KEY (ScheduleID) REFERENCES Schedules(ScheduleID),
    FOREIGN KEY (DriverID) REFERENCES Drivers(DriverID)
);

CREATE TABLE Notifications (
    NotificationID INT PRIMARY KEY AUTO_INCREMENT,
    UserID INT NOT NULL,
    Message TEXT NOT NULL,
    NotificationDate DATETIME NOT NULL,
    IsRead BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

CREATE TABLE WalletTransactions (
    TransactionID INT PRIMARY KEY AUTO_INCREMENT,
    UserID INT NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    TransactionType ENUM('Credit', 'Debit') NOT NULL,
    TransactionDate DATETIME NOT NULL,
    Description TEXT,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

CREATE TABLE PaymentRefunds (
    RefundID INT PRIMARY KEY AUTO_INCREMENT,
    PaymentID INT NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    RefundDate DATETIME NOT NULL,
    Status ENUM('Processed', 'Pending', 'Failed') NOT NULL,
    FOREIGN KEY (PaymentID) REFERENCES Payments(PaymentID)
);

CREATE TABLE Pricing (
    PriceID INT PRIMARY KEY AUTO_INCREMENT,
    RouteID INT NOT NULL,
    BusTypeID INT NOT NULL,
    BasePrice DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (RouteID) REFERENCES Routes(RouteID),
    FOREIGN KEY (BusTypeID) REFERENCES BusTypes(BusTypeID)
);

CREATE TABLE LuggageDetails (
    LuggageID INT PRIMARY KEY AUTO_INCREMENT,
    BookingID INT NOT NULL,
    Weight DECIMAL(5,2) NOT NULL,
    Type ENUM('Hand Baggage', 'Checked Baggage') NOT NULL,
    FOREIGN KEY (BookingID) REFERENCES Bookings(BookingID)
);

CREATE TABLE Coupons (
    CouponID INT PRIMARY KEY AUTO_INCREMENT,
    Code VARCHAR(20) NOT NULL,
    DiscountPercentage INT NOT NULL,
    ValidFrom DATE NOT NULL,
    ValidTo DATE NOT NULL
);

CREATE TABLE PopularRoutes (
    RouteID INT NOT NULL,
    PopularityScore INT NOT NULL,
    LastUpdated DATETIME NOT NULL,
    PRIMARY KEY (RouteID),
    FOREIGN KEY (RouteID) REFERENCES Routes(RouteID)
);

-- Modify Schedules table to use DATETIME
ALTER TABLE Schedules 
MODIFY COLUMN DepartureTime DATETIME NOT NULL,
MODIFY COLUMN ArrivalTime DATETIME NOT NULL,
ADD COLUMN AvailableSeats INT NOT NULL;

-- Add necessary indexes
ALTER TABLE Cities ADD INDEX idx_cityname (CityName);
ALTER TABLE Buses ADD INDEX idx_busnumber (BusNumber);
ALTER TABLE Schedules ADD INDEX idx_departure (DepartureTime);
ALTER TABLE Routes ADD INDEX idx_source_dest (SourceCityID, DestinationCityID);

use bus;

select * from users;