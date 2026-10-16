package com.hayalnaft.attendance.util

import android.content.Context
import android.net.Uri
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.zip.ZipInputStream

data class ParsedStudent(val name: String, val phone: String)

class ImportException(message: String) : Exception(message)

/**
 * Reads student names (and optional parent phone numbers) from Excel (.xlsx), Word (.docx),
 * CSV / text files, or pasted text. Everything is parsed locally, no internet needed.
 */
object Importer {

    private val headerWords = setOf(
        "الاسم", "اسم", "اسم الطالب", "الاسم الكامل", "الاسم الثلاثي", "الاسم الرباعي",
        "اسم الطالب الثلاثي", "اسم الطالب الرباعي", "الطالب", "الطلاب", "اسماء الطلاب",
        "الهاتف", "رقم الهاتف", "الموبايل", "رقم ولي الامر", "هاتف ولي الامر", "ولي الامر",
        "name", "student", "student name", "full name", "phone",
    )

    private val separators = Regex("""\t|\s*[,;|،؛]\s*""")
    private val phoneInText = Regex("""\+?\d[\d\s\-]{5,}\d""")
    private val serialWithMark = Regex("""^\s*\d{1,4}\s*[\-.)\]/:–ـ]+\s*""")
    private val serialWithSpace = Regex("""^\s*\d{1,4}\s+(?=\D)""")
    private val spaces = Regex("""\s+""")

    fun fromUri(context: Context, uri: Uri): List<ParsedStudent> {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw ImportException("تعذر فتح الملف")
        return fromBytes(bytes)
    }

    fun fromBytes(bytes: ByteArray): List<ParsedStudent> {
        if (bytes.size >= 4 && bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte()) {
            val entries = unzip(bytes)
            return when {
                entries.keys.any { it.startsWith("xl/worksheets/") } -> fromRows(readXlsx(entries))
                entries.containsKey("word/document.xml") -> fromRows(readDocx(entries))
                else -> throw ImportException("صيغة الملف غير مدعومة. استخدم ملف Excel (xlsx) أو Word (docx)")
            }
        }
        if (bytes.size >= 8 && bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte()) {
            throw ImportException(
                "هذا الملف بصيغة قديمة (xls أو doc). افتحه واحفظه بصيغة xlsx أو docx ثم أعد المحاولة، " +
                    "أو انسخ الأسماء منه والصقها مباشرة."
            )
        }
        return fromText(decodeText(bytes))
    }

    fun fromText(text: String): List<ParsedStudent> =
        fromRows(text.lines().map { line -> line.split(separators) })

    private fun fromRows(rows: List<List<String>>): List<ParsedStudent> =
        rows.mapNotNull { rowToStudent(it) }.distinctBy { it.name }

    // ---------- Row interpretation ----------

    private fun rowToStudent(cells: List<String>): ParsedStudent? {
        val parts = cells.map { cleanCell(it) }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) return null
        if (parts.size == 1) return lineToStudent(parts[0])

        var name = ""
        var phone = ""
        for (p in parts) {
            val letters = p.count { it.isLetter() }
            val digits = p.count { it.isDigit() }
            if (letters == 0) {
                if (phone.isEmpty() && digits >= 7) phone = normalizePhone(p)
            } else if (name.isEmpty() && letters >= 2) {
                name = p
            }
        }
        if (name.isEmpty()) return null
        val fromName = lineToStudent(name) ?: return null
        return ParsedStudent(fromName.name, phone.ifEmpty { fromName.phone })
    }

    private fun lineToStudent(line: String): ParsedStudent? {
        var s = stripSerial(line)
        var phone = ""
        val m = phoneInText.find(s)
        if (m != null && m.value.count { it.isDigit() } >= 7) {
            phone = normalizePhone(m.value)
            s = s.removeRange(m.range)
        }
        val name = cleanName(s)
        if (name.count { it.isLetter() } < 2 || isHeader(name)) return null
        return ParsedStudent(name, phone)
    }

    private fun stripSerial(s: String): String =
        s.replace(serialWithMark, "").replace(serialWithSpace, "")

    private fun cleanName(s: String): String =
        stripSerial(s).replace(spaces, " ").trim { it.isWhitespace() || it in "-–—:._|*•·()[]\"'" }

    private fun isHeader(name: String): Boolean {
        val n = name.lowercase().replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').trim()
        // Title rows such as "قائمة طلاب الرابع العلمي" or "اسماء طلاب الصف".
        return n in headerWords || "طلاب" in n || n.startsWith("قائمة") || n.startsWith("اسماء")
    }

    private fun cleanCell(s: String): String {
        val sb = StringBuilder(s.length)
        for (ch in s) {
            when (ch) {
                in '٠'..'٩' -> sb.append('0' + (ch - '٠'))
                in '۰'..'۹' -> sb.append('0' + (ch - '۰'))
                ' ' -> sb.append(' ')
                '‎', '‏', in '‪'..'‮', '﻿' -> {}
                else -> sb.append(ch)
            }
        }
        return sb.toString().trim()
    }

    fun normalizePhone(raw: String): String {
        val s = cleanCell(raw)
        var digits = s.filter { it.isDigit() }
        // Excel stores 07701234567 as the number 7701234567.
        if (digits.length == 10 && digits.startsWith("7")) digits = "0$digits"
        return if (s.trimStart().startsWith("+")) "+$digits" else digits
    }

    // ---------- Text ----------

    private fun decodeText(bytes: ByteArray): String {
        if (bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte()) {
            return String(bytes, 2, bytes.size - 2, Charsets.UTF_16LE)
        }
        if (bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte()) {
            return String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
        }
        val start = if (bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte()) 3 else 0
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        return try {
            decoder.decode(ByteBuffer.wrap(bytes, start, bytes.size - start)).toString()
        } catch (e: CharacterCodingException) {
            String(bytes, Charset.forName("windows-1256"))
        }
    }

    // ---------- Zip / XML helpers ----------

    private fun unzip(bytes: ByteArray): Map<String, ByteArray> {
        val out = mutableMapOf<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                val name = e.name.trimStart('/')
                val wanted = name.startsWith("xl/") || name == "word/document.xml"
                if (!e.isDirectory && wanted && (name.endsWith(".xml") || name.endsWith(".rels"))) {
                    out[name] = zip.readBytes()
                }
            }
        }
        return out
    }

    private fun local(name: String?): String = name?.substringAfter(':') ?: ""

    private fun attr(p: XmlPullParser, localName: String): String? {
        for (i in 0 until p.attributeCount) {
            if (local(p.getAttributeName(i)) == localName) return p.getAttributeValue(i)
        }
        return null
    }

    private fun parse(bytes: ByteArray, handler: (XmlPullParser) -> Unit) {
        val p = XmlPullParserFactory.newInstance().newPullParser()
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        p.setInput(ByteArrayInputStream(bytes), "UTF-8")
        while (p.next() != XmlPullParser.END_DOCUMENT) handler(p)
    }

    // ---------- Excel ----------

    private fun readXlsx(e: Map<String, ByteArray>): List<List<String>> {
        val shared = e["xl/sharedStrings.xml"]?.let { sharedStrings(it) } ?: emptyList()
        val path = firstSheetPath(e)?.takeIf { e.containsKey(it) }
            ?: e.keys.filter { it.startsWith("xl/worksheets/") && it.endsWith(".xml") }.minOrNull()
            ?: throw ImportException("لا توجد أوراق بيانات في ملف Excel")
        return sheetRows(e.getValue(path), shared)
    }

    private fun firstSheetPath(e: Map<String, ByteArray>): String? {
        val wb = e["xl/workbook.xml"] ?: return null
        val rels = e["xl/_rels/workbook.xml.rels"] ?: return null
        var rid: String? = null
        parse(wb) { p ->
            if (rid == null && p.eventType == XmlPullParser.START_TAG && local(p.name) == "sheet") rid = attr(p, "id")
        }
        var target: String? = null
        parse(rels) { p ->
            if (target == null && p.eventType == XmlPullParser.START_TAG && local(p.name) == "Relationship" &&
                attr(p, "Id") == rid
            ) target = attr(p, "Target")
        }
        val t = target ?: return null
        return if (t.startsWith("/")) t.trimStart('/') else "xl/$t"
    }

    private fun sharedStrings(bytes: ByteArray): List<String> {
        val out = mutableListOf<String>()
        val sb = StringBuilder()
        var inT = false
        var inPhonetic = false
        parse(bytes) { p ->
            when (p.eventType) {
                XmlPullParser.START_TAG -> when (local(p.name)) {
                    "si" -> sb.setLength(0)
                    "t" -> inT = true
                    "rPh" -> inPhonetic = true
                }
                XmlPullParser.TEXT -> if (inT && !inPhonetic) sb.append(p.text)
                XmlPullParser.END_TAG -> when (local(p.name)) {
                    "t" -> inT = false
                    "rPh" -> inPhonetic = false
                    "si" -> out.add(sb.toString())
                }
            }
        }
        return out
    }

    private fun sheetRows(bytes: ByteArray, shared: List<String>): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row: java.util.TreeMap<Int, String>? = null
        var col = 0
        var nextCol = 0
        var type = ""
        val value = StringBuilder()
        var inValue = false
        parse(bytes) { p ->
            when (p.eventType) {
                XmlPullParser.START_TAG -> when (local(p.name)) {
                    "row" -> {
                        row = java.util.TreeMap()
                        nextCol = 0
                    }
                    "c" -> {
                        col = attr(p, "r")?.let { columnIndex(it) } ?: nextCol
                        nextCol = col + 1
                        type = attr(p, "t") ?: ""
                        value.setLength(0)
                    }
                    "v", "t" -> inValue = true
                }
                XmlPullParser.TEXT -> if (inValue) value.append(p.text)
                XmlPullParser.END_TAG -> when (local(p.name)) {
                    "v", "t" -> inValue = false
                    "c" -> {
                        val raw = value.toString()
                        val text = when (type) {
                            "s" -> raw.trim().toIntOrNull()?.let { shared.getOrNull(it) } ?: ""
                            "inlineStr", "str" -> raw
                            "b", "e" -> ""
                            else -> numberText(raw)
                        }
                        if (text.isNotBlank()) row?.put(col, text)
                    }
                    "row" -> {
                        row?.let { if (it.isNotEmpty()) rows.add(it.values.toList()) }
                        row = null
                    }
                }
            }
        }
        return rows
    }

    private fun columnIndex(ref: String): Int {
        var n = 0
        for (ch in ref) {
            if (ch !in 'A'..'Z') break
            n = n * 26 + (ch - 'A' + 1)
        }
        return n - 1
    }

    private fun numberText(raw: String): String {
        val t = raw.trim()
        if (t.isEmpty()) return ""
        return try {
            BigDecimal(t).stripTrailingZeros().toPlainString()
        } catch (e: NumberFormatException) {
            t
        }
    }

    // ---------- Word ----------

    private fun readDocx(e: Map<String, ByteArray>): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var tableDepth = 0
        var cells: MutableList<String>? = null
        val cell = StringBuilder()
        val para = StringBuilder()
        var inText = false
        var inProps = 0
        parse(e.getValue("word/document.xml")) { p ->
            when (p.eventType) {
                XmlPullParser.START_TAG -> when (local(p.name)) {
                    "tbl" -> tableDepth++
                    "tr" -> if (tableDepth == 1) cells = mutableListOf()
                    "tc" -> if (tableDepth == 1) cell.setLength(0)
                    "p" -> para.setLength(0)
                    "pPr" -> inProps++
                    "t" -> inText = true
                    "tab" -> if (inProps == 0) para.append('\t')
                    "br", "cr" -> para.append('\n')
                }
                XmlPullParser.TEXT -> if (inText) para.append(p.text)
                XmlPullParser.END_TAG -> when (local(p.name)) {
                    "t" -> inText = false
                    "pPr" -> inProps--
                    "p" -> if (tableDepth > 0) {
                        if (cell.isNotEmpty()) cell.append(' ')
                        cell.append(para)
                    } else {
                        para.toString().split('\n').forEach { line -> rows.add(line.split(separators)) }
                    }
                    "tc" -> if (tableDepth == 1) cells?.add(cell.toString())
                    "tr" -> if (tableDepth == 1) {
                        cells?.let { rows.add(it) }
                        cells = null
                    }
                    "tbl" -> tableDepth--
                }
            }
        }
        return rows
    }
}
