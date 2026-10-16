package com.hayalnaft.attendance.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.text.Layout
import com.hayalnaft.attendance.data.DateRange
import com.hayalnaft.attendance.data.Db
import com.hayalnaft.attendance.data.EventType
import com.hayalnaft.attendance.data.GradeField
import com.hayalnaft.attendance.data.GradeResult
import com.hayalnaft.attendance.data.Grades
import com.hayalnaft.attendance.data.LessonPlan
import com.hayalnaft.attendance.data.School
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.data.Subject
import java.io.File

/** Builds the printable PDF documents and the plain-text parent report. */
object Reports {

    fun logoFile(context: Context) = File(context.filesDir, "logo.png")

    private fun logo(context: Context): Bitmap? = logoFile(context).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }

    private fun PdfBuilder.header(context: Context, school: School, title: String, subtitle: String? = null) =
        schoolHeader(school, title, subtitle, logo(context))

    private fun fmt(v: Double?): String = when {
        v == null -> ""
        v == Math.floor(v) -> v.toLong().toString()
        else -> v.toString()
    }

    private fun fmt(v: Int?) = v?.toString() ?: ""

    fun result(values: Map<String, Double>?, school: School, cls: SchoolClass): GradeResult =
        Grades.compute(values ?: emptyMap(), school.maxMark, school.exemptMark, cls.ministerial)

    /** The grade a student finally holds in a subject: the final grade when known, otherwise the annual effort. */
    private fun bestGrade(r: GradeResult) = r.finalGrade ?: r.annual

    /** Full grade sheet of one subject for one class. */
    fun subjectSheet(context: Context, db: Db, school: School, cls: SchoolClass, subject: Subject): File {
        val students = db.students(school.id, cls.id)
        val grades = db.classGrades(cls.id)
        val pdf = PdfBuilder(landscape = true)
        pdf.header(context, school, "كشف درجات مادة ${subject.name}", "${cls.title}${roomText(cls)}")
        val headers = listOf(
            "ت", "اسم الطالب", "الشهر الأول", "الشهر الثاني", "معدل الفصل الأول", "نصف السنة",
            "الشهر الأول ف2", "الشهر الثاني ف2", "معدل الفصل الثاني", "السعي السنوي", "الامتحان النهائي",
            "الدرجة النهائية", "النتيجة",
        )
        val results = students.map { result(grades[it.id]?.get(subject.id), school, cls) }
        val rows = students.mapIndexed { i, s ->
            val v = grades[s.id]?.get(subject.id) ?: emptyMap()
            val r = results[i]
            listOf(
                "${i + 1}", s.name, fmt(v[GradeField.M1]), fmt(v[GradeField.M2]), fmt(r.semester1), fmt(v[GradeField.MID]),
                fmt(v[GradeField.M3]), fmt(v[GradeField.M4]), fmt(r.semester2), fmt(r.annual),
                if (r.exempt) "معفى" else fmt(v[GradeField.FINAL]), fmt(r.finalGrade), r.status,
            )
        }
        pdf.table(
            headers, rows, listOf(0.5f, 3.2f, 1f, 1f, 1.1f, 1f, 1f, 1f, 1.1f, 1f, 1.1f, 1.1f, 1f),
            cellColor = { r, c -> statusColor(results[r].status).takeIf { c == 12 } },
        )
        val exempt = results.count { it.exempt }
        val graded = results.count { it.finalGrade != null }
        val passed = results.count { it.status == "ناجح" || it.exempt }
        pdf.text("عدد الطلاب: ${students.size}   •   المعفون: $exempt   •   الناجحون: $passed من $graded", 10f, true)
        pdf.signatures("مدرس المادة", "مدير المدرسة")
        return pdf.save(PdfFiles.file(context, "كشف ${subject.name} ${cls.title}"))
    }

    /** All subjects of a class side by side with the general average. */
    fun classSheet(context: Context, db: Db, school: School, cls: SchoolClass): File {
        val students = db.students(school.id, cls.id)
        val subjects = db.subjects(school.id)
        val grades = db.classGrades(cls.id)
        val pdf = PdfBuilder(landscape = true)
        pdf.header(context, school, "الكشف الشامل لدرجات الطلاب", "${cls.title}${roomText(cls)}")
        val headers = listOf("ت", "اسم الطالب") + subjects.map { it.name } + listOf("المعدل", "النتيجة")
        val pass = Grades.roundUp(school.maxMark / 2.0)
        val rows = students.mapIndexed { i, s ->
            val marks = subjects.map { sub -> bestGrade(result(grades[s.id]?.get(sub.id), school, cls)) }
            val known = marks.filterNotNull()
            val avg = if (known.isEmpty()) null else Grades.roundUp(known.sum().toDouble() / known.size)
            val failed = known.count { it < pass }
            val res = when {
                known.isEmpty() -> ""
                failed == 0 -> "ناجح"
                else -> "مكمل في $failed"
            }
            listOf("${i + 1}", s.name) + marks.map { fmt(it) } + listOf(fmt(avg), res)
        }
        val weights = listOf(0.5f, 3f) + subjects.map { 1f } + listOf(1f, 1.2f)
        pdf.table(headers, rows, weights, size = if (subjects.size > 9) 8f else 9.5f, cellColor = { r, c ->
            val cell = rows[r][c]
            when {
                c == rows[r].lastIndex -> statusColor(if (cell.startsWith("مكمل")) "مكمل" else cell)
                c in 2 until 2 + subjects.size -> cell.toIntOrNull()?.takeIf { it < pass }?.let { 0x22C62828 }
                else -> null
            }
        })
        pdf.text("الدرجة المعتمدة لكل مادة هي الدرجة النهائية إن وجدت وإلا السعي السنوي. الدرجات الحمراء دون درجة النجاح ($pass).", 9f)
        pdf.signatures("مرشد الصف", "مدير المدرسة")
        return pdf.save(PdfFiles.file(context, "الكشف الشامل ${cls.title}"))
    }

    /** Everything known about one student over a period: attendance, activity, behaviour, grades and notes. */
    fun studentReport(
        context: Context, db: Db, school: School, cls: SchoolClass, student: Student, range: DateRange = DateRange.ALL,
    ): File {
        val pdf = PdfBuilder()
        pdf.header(context, school, "تقرير الطالب", student.name)
        pdf.table(
            listOf("اسم الطالب", "الصف والشعبة", "رقم ولي الأمر", "فترة التقرير"),
            listOf(listOf(student.name, cls.title, student.phone, Periods.describe(range))),
            listOf(2f, 1.4f, 1.3f, 2.2f),
        )
        val st = db.studentStats(student.id, range)
        val t = db.eventTotals(student.id, range)
        pdf.statBoxes(
            listOf(
                Triple("نسبة الحضور", st?.attendanceRate?.let { "$it%" } ?: "-", rateColor(st?.attendanceRate)),
                Triple("أيام الغياب", "${st?.absent ?: 0}", PdfBuilder.RED),
                Triple("نقاط النشاط", "${t.points}", PdfBuilder.GOLD),
                Triple("سلوك جيد / مشاغب", "${t.good} / ${t.bad}", PdfBuilder.NAVY),
            )
        )
        pdf.heading("الحضور والغياب")
        pdf.table(
            listOf("حضور", "غياب", "تأخر", "إجازة"),
            listOf(listOf(fmt(st?.present), fmt(st?.absent), fmt(st?.late), fmt(st?.excused))),
            listOf(1f, 1f, 1f, 1f),
        )
        val missed = db.history(student.id, range).filter { it.status != com.hayalnaft.attendance.data.Status.PRESENT }.take(30)
        if (missed.isNotEmpty()) {
            pdf.table(
                listOf("التاريخ", "الحصة", "الحالة"),
                missed.map { listOf(Dates.pretty(it.date), it.subjectName ?: "التعداد اليومي", statusText(it.status)) },
                listOf(2f, 2f, 1.2f),
                cellColor = { r, c -> if (c == 2) statusTint(missed[r].status) else null },
            )
        }
        val subjects = db.subjects(school.id)
        val grades = db.studentGrades(student.id)
        if (subjects.isNotEmpty() && grades.isNotEmpty()) {
            pdf.heading("الدرجات")
            pdf.table(
                listOf("المادة", "الفصل الأول", "نصف السنة", "الفصل الثاني", "السعي السنوي", "الدرجة النهائية", "النتيجة"),
                subjects.map { sub ->
                    val v = grades[sub.id] ?: emptyMap()
                    val r = result(v, school, cls)
                    listOf(sub.name, fmt(r.semester1), fmt(v[GradeField.MID]), fmt(r.semester2), fmt(r.annual), fmt(r.finalGrade), r.status)
                },
                listOf(2f, 1f, 1f, 1f, 1f, 1.1f, 1f),
            )
        }
        val notes = db.events(student.id, range).filter { it.note.isNotBlank() || it.type != EventType.POINTS }.take(20)
        if (notes.isNotEmpty()) {
            pdf.heading("الملاحظات والسلوك")
            pdf.table(
                listOf("التاريخ", "النوع", "الملاحظة"),
                notes.map { listOf(Dates.display(it.date), eventLabel(it.type, it.points), it.note) },
                listOf(1.2f, 1.2f, 4f),
            )
        }
        pdf.signatures("المدرس / المرشد", "مدير المدرسة")
        return pdf.save(PdfFiles.file(context, "تقرير ${student.name} ${range.label}"))
    }

    /** A class over a period: summary boxes, every student's attendance, activity and average, and highlights. */
    fun classReport(context: Context, db: Db, school: School, cls: SchoolClass, range: DateRange): File {
        val stats = db.stats(school.id, cls.id, range).sortedBy { it.student.id }
        val totals = db.classEventTotals(cls.id, range)
        val subjects = db.subjects(school.id)
        val grades = db.classGrades(cls.id)
        val averages = stats.associate { st ->
            val marks = subjects.mapNotNull { sub -> result(grades[st.student.id]?.get(sub.id), school, cls).let(::bestGrade) }
            st.student.id to (if (marks.isEmpty()) null else Grades.roundUp(marks.sum().toDouble() / marks.size))
        }
        val pdf = PdfBuilder(landscape = true)
        pdf.header(context, school, "تقرير الصف ${cls.title}", Periods.describe(range))
        val recorded = stats.sumOf { it.recorded }
        val attended = stats.sumOf { it.present + it.late + it.excused }
        val rate = if (recorded == 0) null else Math.round(attended * 100f / recorded)
        pdf.statBoxes(
            listOf(
                Triple("عدد الطلاب", "${stats.size}", PdfBuilder.NAVY),
                Triple("نسبة الحضور العامة", rate?.let { "$it%" } ?: "-", rateColor(rate)),
                Triple("مجموع الغيابات", "${stats.sumOf { it.absent }}", PdfBuilder.RED),
                Triple("مجموع التأخر", "${stats.sumOf { it.late }}", Color.rgb(239, 108, 0)),
                Triple("نقاط النشاط", "${totals.values.sumOf { it.points }}", PdfBuilder.GOLD),
            )
        )
        val rows = stats.mapIndexed { i, st ->
            val t = totals[st.student.id]
            listOf(
                "${i + 1}", st.student.name, "${st.present}", "${st.absent}", "${st.late}", "${st.excused}",
                st.attendanceRate?.let { "$it%" } ?: "-", "${t?.points ?: 0}", "${t?.good ?: 0}", "${t?.bad ?: 0}",
                fmt(averages[st.student.id]),
            )
        }
        pdf.table(
            listOf("ت", "اسم الطالب", "حضور", "غياب", "تأخر", "إجازة", "نسبة الحضور", "نقاط النشاط", "سلوك جيد", "مشاغب", "معدل الدرجات"),
            rows,
            listOf(0.5f, 3f, 0.9f, 0.9f, 0.9f, 0.9f, 1.1f, 1.1f, 1f, 0.9f, 1.1f),
            cellColor = { r, c ->
                when (c) {
                    6 -> stats[r].attendanceRate?.let { lightTint(rateColor(it)) }
                    3 -> if (stats[r].absent > 0) 0x22C62828 else null
                    else -> null
                }
            },
        )
        val mostAbsent = stats.filter { it.absent > 0 }.sortedByDescending { it.absent }.take(5)
        val mostActive = stats.map { it.student to (totals[it.student.id]?.points ?: 0) }.filter { it.second > 0 }
            .sortedByDescending { it.second }.take(5)
        if (mostAbsent.isNotEmpty() || mostActive.isNotEmpty()) {
            pdf.heading("أبرز الملاحظات")
            if (mostActive.isNotEmpty()) {
                pdf.text("الأكثر نشاطاً: " + mostActive.joinToString("، ") { "${it.first.name} (${it.second})" }, 10.5f)
            }
            if (mostAbsent.isNotEmpty()) {
                pdf.text("الأكثر غياباً: " + mostAbsent.joinToString("، ") { "${it.student.name} (${it.absent})" }, 10.5f)
            }
        }
        pdf.signatures("مرشد الصف", "مدير المدرسة")
        return pdf.save(PdfFiles.file(context, "تقرير ${cls.title} ${range.label}"))
    }

    private fun rateColor(rate: Int?): Int = when {
        rate == null -> Color.GRAY
        rate >= 90 -> PdfBuilder.GREEN
        rate >= 75 -> Color.rgb(239, 108, 0)
        else -> PdfBuilder.RED
    }

    private fun lightTint(c: Int) = Color.argb(45, Color.red(c), Color.green(c), Color.blue(c))

    private fun statusText(s: Int) = when (s) {
        com.hayalnaft.attendance.data.Status.ABSENT -> "غائب"
        com.hayalnaft.attendance.data.Status.LATE -> "متأخر"
        com.hayalnaft.attendance.data.Status.EXCUSED -> "مجاز"
        else -> "حاضر"
    }

    private fun statusTint(s: Int): Int? = when (s) {
        com.hayalnaft.attendance.data.Status.ABSENT -> 0x33C62828
        com.hayalnaft.attendance.data.Status.LATE -> 0x33EF6C00
        com.hayalnaft.attendance.data.Status.EXCUSED -> 0x331565C0
        else -> null
    }

    fun eventLabel(type: Int, points: Int) = when (type) {
        EventType.POINTS -> "نشاط \u200E+$points"
        EventType.GOOD -> "سلوك جيد"
        EventType.BAD -> "سلوك مشاغب"
        else -> "ملاحظة"
    }

    /** Short report sent as a WhatsApp or SMS message. */
    fun studentText(db: Db, school: School, cls: SchoolClass, student: Student, range: DateRange = DateRange.ALL): String {
        val st = db.studentStats(student.id, range)
        val t = db.eventTotals(student.id, range)
        val subjects = db.subjects(school.id)
        val grades = db.studentGrades(student.id)
        return buildString {
            appendLine("تقرير الطالب: ${student.name}")
            appendLine("${cls.title} — ${school.name}")
            appendLine("التاريخ: ${Dates.display(Dates.today())}")
            if (range != DateRange.ALL) appendLine("الفترة: ${Periods.describe(range)}")
            appendLine()
            st?.attendanceRate?.let { appendLine("نسبة الحضور: $it%") }
            appendLine("الحضور: ${st?.present ?: 0} | الغياب: ${st?.absent ?: 0} | التأخر: ${st?.late ?: 0} | الإجازات: ${st?.excused ?: 0}")
            appendLine("نقاط النشاط: ${t.points} | سلوك جيد: ${t.good} | سلوك مشاغب: ${t.bad}")
            val lines = subjects.mapNotNull { sub ->
                val r = result(grades[sub.id], school, cls)
                val g = bestGrade(r) ?: r.semester1 ?: return@mapNotNull null
                "• ${sub.name}: $g${if (r.status.isNotBlank()) " (${r.status})" else ""}"
            }
            if (lines.isNotEmpty()) {
                appendLine()
                appendLine("الدرجات:")
                lines.forEach { appendLine(it) }
            }
            db.events(student.id).firstOrNull { it.note.isNotBlank() }?.let {
                appendLine()
                appendLine("آخر ملاحظة: ${it.note}")
            }
            appendLine()
            append("إدارة ${school.name}")
        }
    }

    /** Certificate of appreciation for a student exempted in one or more subjects. */
    fun certificate(context: Context, school: School, cls: SchoolClass, student: Student, subjects: List<Pair<String, Int>>): File {
        val pdf = PdfBuilder(landscape = true, pageNumbers = false)
        val c = pdf.canvas
        val w = pdf.pageWidth.toFloat()
        val h = pdf.pageHeight.toFloat()
        c.drawRect(RectF(14f, 14f, w - 14, h - 14), Paint().apply { color = PdfBuilder.NAVY; style = Paint.Style.STROKE; strokeWidth = 6f })
        c.drawRect(RectF(24f, 24f, w - 24, h - 24), Paint().apply { color = PdfBuilder.GOLD; style = Paint.Style.STROKE; strokeWidth = 2f })
        pdf.space(14f)
        pdf.header(context, school, "")
        pdf.space(40f)
        pdf.text("شهادة تقديرية", 34f, true, PdfBuilder.NAVY, Layout.Alignment.ALIGN_CENTER, 18f)
        val subjectText = subjects.joinToString("، ") { "${it.first} (${it.second})" }
        val body = "تتقدم إدارة ${school.name} بخالص الشكر والتقدير إلى الطالب\n${student.name}\n" +
            "في ${cls.title}، لتفوقه وحصوله على الإعفاء في ${if (subjects.size > 1) "المواد" else "مادة"}: $subjectText\n" +
            "للعام الدراسي ${school.yearText}، متمنين له دوام التألق والنجاح."
        pdf.text(body, 18f, false, android.graphics.Color.BLACK, Layout.Alignment.ALIGN_CENTER, 20f)
        pdf.space(40f)
        pdf.signatures(if (school.teacher.isBlank()) "المدرس" else "المدرس\n${school.teacher}", if (school.principal.isBlank()) "مدير المدرسة" else "مدير المدرسة\n${school.principal}")
        return pdf.save(PdfFiles.file(context, "شهادة تقديرية ${student.name}"))
    }

    fun lessonPlan(context: Context, school: School, plan: LessonPlan): File {
        val pdf = PdfBuilder()
        pdf.header(context, school, "الخطة التربوية اليومية")
        pdf.table(
            listOf("اليوم والتاريخ", "الصف والشعبة", "المادة", "عنوان الموضوع"),
            listOf(listOf(Dates.pretty(plan.date), plan.classTitle, plan.subjectName, plan.title)),
            listOf(1.4f, 1.3f, 1.1f, 2.2f),
        )
        val sections = listOf(
            "الأهداف المعرفية" to plan.cognitive,
            "الأهداف الوجدانية" to plan.affective,
            "الأهداف المهارية (النفسحركية)" to plan.psychomotor,
            "الوسائل التعليمية" to plan.aids,
            "خطوات سير الدرس" to plan.steps,
            "الواجب البيتي" to plan.homework,
            "ملاحظات" to plan.notes,
        )
        for ((title, body) in sections) {
            if (body.isBlank()) continue
            pdf.heading(title)
            pdf.text(body, 11f)
        }
        pdf.signatures(if (school.teacher.isBlank()) "المدرس" else "المدرس: ${school.teacher}", "المشرف / مدير المدرسة")
        return pdf.save(PdfFiles.file(context, "خطة ${plan.title} ${plan.date}"))
    }

    private fun roomText(cls: SchoolClass) = if (cls.room.isBlank()) "" else " — قاعة ${cls.room}"

    private fun statusColor(status: String): Int? = when (status) {
        "ناجح" -> 0x332E7D32
        "معفى" -> 0x55F2A900
        "مكمل" -> 0x33C62828
        else -> null
    }
}
