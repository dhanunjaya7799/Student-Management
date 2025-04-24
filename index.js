const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit-table');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload());

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

mongoose.connect('mongodb://127.0.0.1:27017/student-details-data');

const studentSchema = new mongoose.Schema({
    name: String,
    password: String,
    gender: String,
    email: String,
    contact: Number,
    admissionNo: String,
    rollNo: String,
    course: String,
    branch: String,
    semester: String,
    dob: String,
    nationality: String,
    religion: String,
    sscMarks: String,
    sscGradepoints: String,
    interMarks: String,
    interGradepoints: String,
    entranceType: String,
    eamcetRank: String,
    seatType: String,
    caste: String,
    joiningDate: String,
    bloodGroup: String,
    fatherName: String,
    motherName: String,
    aadharNo: String,
    guardianContact: String,
    phonenumber: Number,
    address: String,
    languages: String
});

const Student = mongoose.model('Student', studentSchema, 'cseproject');

const attendanceSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    rollNo: String,
    subject: String,
    date: { type: Date, default: Date.now },
    status: [String]
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

const userConnection = mongoose.createConnection('mongodb://127.0.0.1:27017/user-login-db');

const userSchema = new mongoose.Schema({
    username: String,
    password: String
});

const User = userConnection.model('User', userSchema);
app.post('/register', async (req, res) => {
    try {
        const {
            name, password, gender, email, contact,
            admissionNo, rollNo, course, branch, semester,
            dob, nationality, religion, sscMarks, sscGradepoints,
            interMarks, interGradepoints, eamcetRank,
            seatType, caste, joiningDate, bloodGroup,
            fatherName, motherName, aadharNo, guardianContact, phonenumber, address, languages
        } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        const student = new Student({
            name,
            password: hashedPassword,
            gender,
            email,
            contact,
            admissionNo,
            rollNo,
            course,
            branch,
            semester,
            dob,
            nationality,
            religion,
            sscMarks,
            sscGradepoints,
            interMarks,
            interGradepoints,
            eamcetRank,
            seatType,
            caste,
            joiningDate,
            bloodGroup,
            fatherName,
            motherName,
            aadharNo,
            guardianContact,
            phonenumber,
            address,
            languages
        });

        await student.save();

        const imagefile = req.files?.profilePhoto;
        if (imagefile) {
            const uploadPath = path.join(__dirname, 'public/images', `${name}.jpeg`);
            await imagefile.mv(uploadPath);
        }

        res.sendFile(path.join(__dirname, 'public/login.html'));
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).send("Error during registration");
    }
});
app.get('/main',(req, res) => {
    res.sendFile(path.join(__dirname, 'public/Main.html'));
});

app.get('/login', async(req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.post('/check', async (req, res) => {
    try {
        const { name, password } = req.body;

        const user = await Student.findOne({
            name: { $regex: new RegExp('^' + name + '$', 'i') }
        });

        if (!user) return res.status(401).send("User not found");

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).send("Invalid password");

        let file = `/images/${user.name}.jpeg`;
        if (!fs.existsSync(path.join(__dirname, 'public', file))) {
            file = "/images/default.jpeg";
        }

        const attendanceRecords = await Attendance.find({ studentId: user._id });

        const grouped = {};
        const allDates = new Set();
        const allSubjects = new Set();

        attendanceRecords.forEach(record => {
            const dateStr = new Date(record.date).toLocaleDateString();
            allDates.add(dateStr);
            allSubjects.add(record.subject);
            if (!grouped[record.subject]) grouped[record.subject] = {};
            if (!grouped[record.subject][dateStr]) {
                grouped[record.subject][dateStr] = [];
            }
            grouped[record.subject][dateStr].push(...record.status);
        });

        const knownSubjects = ['Maths', 'Physics', 'Chemistry', 'English', 'C Programming'];
        knownSubjects.forEach(sub => {
            allSubjects.add(sub);
            if (!grouped[sub]) grouped[sub] = {};
        });

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
        const subjectsArray = Array.from(allSubjects);


        const attendancePercentages = {};
        subjectsArray.forEach(subject => {
            let totalClasses = 0;
            let attendedClasses = 0;
            sortedDates.forEach(date => {
                const statuses = grouped[subject]?.[date] || [];
                totalClasses += statuses.length;
                attendedClasses += statuses.filter(status => status !== 'A').length;
            });
            attendancePercentages[subject] = totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0;
        });
        res.render('sample.pug', {
            user,
            file,
            dates: sortedDates,
            groupedAttendance: grouped,
            subjects: subjectsArray,
            attendancePercentages: attendancePercentages
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send("Something went wrong");
    }
});

app.get('/attendance', (req, res) => {
    res.render('attendance-form');
});

app.post('/attendance', async (req, res) => {
    const { rollNo, subject, status } = req.body;

    try {
        const student = await Student.findOne({ rollNo });

        if (!student) {
            return res.status(404).send("Student not found");
        }

        const attendance = new Attendance({
            studentId: student._id,
            rollNo,
            subject,
            status: Array.isArray(status) ? status : [status],
        });

        await attendance.save();
        res.send("Attendance recorded successfully");
    } catch (err) {
        console.error("Attendance error:", err);
        res.status(500).send("Something went wrong");
    }
});

app.get('/download-attendance/:rollNo', async (req, res) => {
    const rollNo = req.params.rollNo;

    try {
        const user = await Student.findOne({ rollNo });

        if (!user) {
            return res.status(404).send('Student not found');
        }

        const attendanceRecords = await Attendance.find({ studentId: user._id });

        const grouped = {};
        const allDates = new Set();
        const allSubjects = new Set();

        attendanceRecords.forEach(record => {
            const dateStr = new Date(record.date).toLocaleDateString();
            allDates.add(dateStr);
            allSubjects.add(record.subject);
            if (!grouped[record.subject]) grouped[record.subject] = {};
            if (!grouped[record.subject][dateStr]) {
                grouped[record.subject][dateStr] = [];
            }
            grouped[record.subject][dateStr].push(...record.status);
        });

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
        const subjectsArray = Array.from(allSubjects);

        const attendancePercentages = {};
        subjectsArray.forEach(subject => {
            let totalClasses = 0;
            let attendedClasses = 0;
            sortedDates.forEach(date => {
                const statuses = grouped[subject]?.[date] || [];
                totalClasses += statuses.length;
                attendedClasses += statuses.filter(status => status !== '').length;
            });
            attendancePercentages[subject] = totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0;
        });

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const filename = `attendance-${rollNo}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        doc.pipe(res);

        doc.fontSize(16).text(`Attendance Report for ${user.name} (${rollNo})`, { align: 'center' });
        doc.moveDown();

        doc.fontSize(12);

        const table = {
            headers: ['Subject', ...sortedDates, 'Percentage'],
            rows: subjectsArray.map(subject => {
                const rowData = [subject];
                sortedDates.forEach(date => {
                    const statuses = grouped[subject]?.[date] || [];
                    rowData.push(statuses.join(', '));
                });
                rowData.push(attendancePercentages[subject].toFixed(2) + '%');
                return rowData;
            }),
        };

        try {
            await doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold'),
                prepareRow: (row, i) => doc.font('Helvetica').fontSize(10),
            });
        } catch (error) {
            console.error("Error drawing table:", error);
            doc.text("Error generating attendance table.");
        }

        doc.end();
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).send('Error generating PDF');
    }
});

app.get('/userlogin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/user.html'));
});

app.post('/usercheck', async (req, res) => {
    const { name, password } = req.body;

    try {
        const user = await User.findOne({ username: name });

        if (!user) return res.status(401).send("User not found");

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).send("Invalid password");

        res.render('special.pug', { user });
    } catch (err) {
        console.error("User login error:", err);
        res.status(500).send("Error during login");
    }
});
app.get('/userreg', async (req, res) => {
    res.sendFile(__dirname + '/public/userregister.html')
})
app.post('/userregister', async (req, res) => {
    const { name, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username: name, password: hashed });
    await newUser.save();
    res.send("User registered in user-login-db");
});

app.listen(5009, () => {
    console.log("Server running at http://localhost:5009/main");
});

