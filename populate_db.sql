-- Insert example routes
INSERT INTO Routes (Source, Destination, Distance, EstimatedTime) VALUES
('Mumbai', 'Pune', 150, '03:00:00'),
('Delhi', 'Agra', 200, '04:00:00'),
('Bangalore', 'Chennai', 350, '06:00:00'),
('Mumbai', 'Nashik', 180, '04:00:00'),
('Pune', 'Nagpur', 700, '10:00:00');

-- Insert buses
INSERT INTO Buses (BusNumber, BusType, Capacity) VALUES
('MH01-AB-1234', 'AC Sleeper', 30),
('DL02-CD-5678', 'AC Seater', 40),
('KA03-EF-9012', 'Non-AC Sleeper', 35),
('MH04-GH-3456', 'AC Seater', 45),
('MH05-IJ-7890', 'AC Sleeper', 30);

-- Insert schedules for 2025-03-30
INSERT INTO Schedules (RouteID, BusID, DepartureTime, ArrivalTime, Price) VALUES
(1, 1, '2025-03-30 06:00:00', '2025-03-30 09:00:00', 800),
(1, 2, '2025-03-30 08:00:00', '2025-03-30 11:00:00', 600),
(2, 3, '2025-03-30 07:00:00', '2025-03-30 11:00:00', 1000),
(3, 4, '2025-03-30 09:00:00', '2025-03-30 15:00:00', 1200),
(4, 5, '2025-03-30 10:00:00', '2025-03-30 14:00:00', 900);

-- Insert seats for each bus (30-45 seats per bus)
-- Bus 1 (30 seats)
INSERT INTO Seats (BusID, SeatNumber, Status) VALUES
(1, 'A1', 'Available'), (1, 'A2', 'Booked'), (1, 'A3', 'Available'),
(1, 'B1', 'Available'), (1, 'B2', 'Available'), (1, 'B3', 'Booked'),
(1, 'C1', 'Booked'), (1, 'C2', 'Available'), (1, 'C3', 'Available');

-- Bus 2 (40 seats sample)
INSERT INTO Seats (BusID, SeatNumber, Status) VALUES
(2, 'A1', 'Available'), (2, 'A2', 'Available'), (2, 'A3', 'Booked'),
(2, 'B1', 'Booked'), (2, 'B2', 'Available'), (2, 'B3', 'Available'),
(2, 'C1', 'Available'), (2, 'C2', 'Booked'), (2, 'C3', 'Available');

-- Add some example bookings
INSERT INTO Users (Name, PhoneNumber, Email, Password, Role) VALUES
('Test User', '9876543210', 'test@example.com', '$2b$10$abcdefghijklmnopqrstuv', 'user');

INSERT INTO Bookings (UserID, ScheduleID, BookingDate, TotalFare, Status) VALUES
(1, 1, '2025-03-29 10:00:00', 800, 'Confirmed'),
(1, 2, '2025-03-29 11:00:00', 600, 'Confirmed');

INSERT INTO Passengers (BookingID, Name, Age, Gender, SeatID) VALUES
(1, 'John Doe', 30, 'Male', 2),
(2, 'Jane Doe', 25, 'Female', 11); 