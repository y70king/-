package com.hayalnaft.attendance.util

import android.content.Context
import com.hayalnaft.attendance.data.School
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** A report independent of its output format: rendered as PDF, Word, Excel or a WhatsApp message. */
data class ReportDoc(
    val fileName: String,
    val title: String,
    val subtitle: String?,
    val landscape: Boolean,
    val blocks: List<Block>,
    val signatures: List<String>,
)

sealed interface Block {
    data class Heading(val text: String) : Block
    data class Para(val text: String, val bold: Boolean = false) : Block

    /** Summary figures: caption, value and an accent colour (ARGB). */
    data class Stats(val items: List<Triple<String, String, Int>>) : Block

    /** Columns are listed right to left. [tint] may colour a cell (ARGB, alpha blended over white). */
    data class Table(
        val headers: List<String>,
        val rows: List<List<String>>,
        val weights: List<Float>,
        val small: Boolean = false,
        val tint: (row: Int, col: Int) -> Int? = { _, _ -> null },
    ) : Block
}

enum class ExportFormat(val label: String) {
    PDF("PDF"),
    WORD("Word"),
    EXCEL("Excel"),
    WHATSAPP("رسالة واتساب"),
}

object Export {
    const val MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    const val MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    private fun file(context: Context, name: String, ext: String): File =
        PdfFiles.file(context, name).let { File(it.parentFile, it.nameWithoutExtension + ".$ext") }

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    /** Colour as RRGGBB, with its alpha blended over white so light tints stay light. */
    private fun hex(argb: Int): String {
        val a = (argb ushr 24 and 0xFF) / 255f
        fun ch(shift: Int) = Math.round(((argb shr shift) and 0xFF) * a + 255 * (1 - a))
        return String.format(java.util.Locale.US, "%02X%02X%02X", ch(16), ch(8), ch(0))
    }

    private fun schoolLines(school: School): List<String> = listOfNotNull(
        "جمهورية العراق — وزارة التربية",
        school.directorate.takeIf { it.isNotBlank() }?.let { "المديرية العامة للتربية في $it" },
        school.name,
        listOfNotNull(school.year.takeIf { it.isNotBlank() }?.let { "العام الدراسي $it" }, "الدوام ${school.shift}").joinToString(" • "),
    )

    private fun zip(target: File, parts: Map<String, String>): File {
        target.parentFile?.mkdirs()
        ZipOutputStream(target.outputStream()).use { z ->
            for ((name, body) in parts) {
                z.putNextEntry(ZipEntry(name))
                z.write(body.toByteArray(Charsets.UTF_8))
                z.closeEntry()
            }
        }
        return target
    }

    // ---------- Word (.docx) ----------

    fun docx(context: Context, school: School, doc: ReportDoc): File {
        val width = if (doc.landscape) 15398 else 10466 // page width minus 0.5" margins, in twips
        val body = StringBuilder()

        fun para(text: String, size: Int = 22, bold: Boolean = false, color: String? = null, center: Boolean = false, after: Int = 80) {
            body.append("<w:p><w:pPr><w:bidi/>")
            if (center) body.append("<w:jc w:val=\"center\"/>")
            body.append("<w:spacing w:before=\"0\" w:after=\"$after\"/></w:pPr>")
            text.split('\n').forEachIndexed { i, line ->
                body.append("<w:r><w:rPr><w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:cs=\"Arial\"/><w:rtl/>")
                if (bold) body.append("<w:b/><w:bCs/>")
                if (color != null) body.append("<w:color w:val=\"$color\"/>")
                body.append("<w:sz w:val=\"$size\"/><w:szCs w:val=\"$size\"/></w:rPr>")
                if (i > 0) body.append("<w:br/>")
                body.append("<w:t xml:space=\"preserve\">${esc(line)}</w:t></w:r>")
            }
            body.append("</w:p>")
        }

        fun cell(text: String, w: Int, fill: String?, bold: Boolean, color: String?, size: Int, borders: Boolean = true) {
            body.append("<w:tc><w:tcPr><w:tcW w:w=\"$w\" w:type=\"dxa\"/>")
            if (!borders) body.append("<w:tcBorders><w:top w:val=\"nil\"/><w:left w:val=\"nil\"/><w:bottom w:val=\"nil\"/><w:right w:val=\"nil\"/></w:tcBorders>")
            if (fill != null) body.append("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"$fill\"/>")
            body.append("<w:vAlign w:val=\"center\"/></w:tcPr>")
            para(text, size, bold, color, center = true, after = 0)
            body.append("</w:tc>")
        }

        fun table(widths: List<Int>, borders: Boolean, rows: () -> Unit) {
            body.append("<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w=\"${widths.sum()}\" w:type=\"dxa\"/><w:tblLayout w:type=\"fixed\"/>")
            if (borders) {
                body.append("<w:tblBorders>")
                for (side in listOf("top", "left", "bottom", "right", "insideH", "insideV")) {
                    body.append("<w:$side w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"7A828C\"/>")
                }
                body.append("</w:tblBorders>")
            }
            body.append("<w:tblCellMar><w:left w:w=\"60\" w:type=\"dxa\"/><w:right w:w=\"60\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr><w:tblGrid>")
            widths.forEach { body.append("<w:gridCol w:w=\"$it\"/>") }
            body.append("</w:tblGrid>")
            rows()
            body.append("</w:tbl>")
            para("", 8, after = 120)
        }

        schoolLines(school).forEachIndexed { i, line -> para(line, if (i == 2) 24 else 18, bold = i == 2, center = true, after = 0) }
        para(doc.title, 32, bold = true, color = "0B3C5D", center = true, after = 0)
        doc.subtitle?.let { para(it, 22, bold = true, color = "0B3C5D", center = true, after = 0) }
        para("", 10, after = 160)

        for (b in doc.blocks) when (b) {
            is Block.Heading -> para(b.text, 26, bold = true, color = "0B3C5D", after = 60)
            is Block.Para -> para(b.text, 21, bold = b.bold)
            is Block.Stats -> {
                val w = width / b.items.size
                table(List(b.items.size) { w }, borders = true) {
                    body.append("<w:tr>")
                    b.items.forEach { (caption, value, color) ->
                        cell("$value\n$caption", w, hex((color and 0x00FFFFFF) or 0x26000000), true, hex(color or 0xFF000000.toInt()), 24)
                    }
                    body.append("</w:tr>")
                }
            }
            is Block.Table -> {
                val total = b.weights.sum()
                val widths = b.weights.map { (it / total * width).toInt() }
                val size = if (b.small) 15 else 18
                table(widths, borders = true) {
                    body.append("<w:tr><w:trPr><w:tblHeader/></w:trPr>")
                    b.headers.forEachIndexed { c, h -> cell(h, widths[c], "0B3C5D", true, "FFFFFF", size) }
                    body.append("</w:tr>")
                    b.rows.forEachIndexed { r, row ->
                        body.append("<w:tr><w:trPr><w:cantSplit/></w:trPr>")
                        row.forEachIndexed { c, v ->
                            val fill = b.tint(r, c)?.let(::hex) ?: if (r % 2 == 1) "EAF0F7" else null
                            cell(v, widths[c], fill, false, null, size)
                        }
                        body.append("</w:tr>")
                    }
                }
            }
        }

        if (doc.signatures.isNotEmpty()) {
            para("", 10, after = 200)
            val w = width / doc.signatures.size
            table(List(doc.signatures.size) { w }, borders = false) {
                body.append("<w:tr>")
                doc.signatures.forEach { cell("$it\n\n.........................", w, null, true, null, 21, borders = false) }
                body.append("</w:tr>")
            }
        }

        val page = if (doc.landscape) "<w:pgSz w:w=\"16838\" w:h=\"11906\" w:orient=\"landscape\"/>" else "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>"
        val document = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>$body" +
            "<w:sectPr>$page<w:pgMar w:top=\"720\" w:right=\"720\" w:bottom=\"720\" w:left=\"720\" w:header=\"0\" w:footer=\"0\" w:gutter=\"0\"/>" +
            "<w:bidi/></w:sectPr></w:body></w:document>"
        return zip(
            file(context, doc.fileName, "docx"),
            linkedMapOf(
                "[Content_Types].xml" to "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                    "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                    "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                    "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
                    "</Types>",
                "_rels/.rels" to "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>" +
                    "</Relationships>",
                "word/document.xml" to document,
            ),
        )
    }

    // ---------- Excel (.xlsx) ----------

    fun xlsx(context: Context, school: School, doc: ReportDoc): File {
        // Styles: 0 default, 1 title, 2 table header, 3 table cell, 4 bold text, 5 heading, then one per tint colour.
        val tints = mutableListOf<String>()
        fun tintStyle(argb: Int): Int {
            val h = hex(argb)
            var i = tints.indexOf(h)
            if (i < 0) {
                tints.add(h)
                i = tints.lastIndex
            }
            return 6 + i
        }

        val rows = StringBuilder()
        val merges = mutableListOf<String>()
        val widths = mutableMapOf<Int, Int>()
        var r = 0
        val maxCols = doc.blocks.filterIsInstance<Block.Table>().maxOfOrNull { it.headers.size }
            ?.coerceAtLeast(doc.blocks.filterIsInstance<Block.Stats>().maxOfOrNull { it.items.size } ?: 0) ?: 6

        fun col(c: Int): String {
            var n = c + 1
            val sb = StringBuilder()
            while (n > 0) {
                val m = (n - 1) % 26
                sb.insert(0, 'A' + m)
                n = (n - 1) / 26
            }
            return sb.toString()
        }

        val number = Regex("""^-?\d+(\.\d+)?$""")
        fun cellXml(c: Int, value: String, style: Int): String {
            val ref = "${col(c)}${r + 1}"
            val numeric = number.matches(value) && !(value.length > 1 && value.startsWith("0") && !value.startsWith("0."))
            return if (numeric) "<c r=\"$ref\" s=\"$style\"><v>$value</v></c>"
            else "<c r=\"$ref\" s=\"$style\" t=\"inlineStr\"><is><t xml:space=\"preserve\">${esc(value)}</t></is></c>"
        }

        fun row(cells: List<Pair<String, Int>>, height: Int? = null, mergeAll: Boolean = false) {
            rows.append("<row r=\"${r + 1}\"").append(height?.let { " ht=\"$it\" customHeight=\"1\"" } ?: "").append(">")
            cells.forEachIndexed { c, (v, s) -> rows.append(cellXml(c, v, s)) }
            rows.append("</row>")
            if (mergeAll && maxCols > 1) merges.add("A${r + 1}:${col(maxCols - 1)}${r + 1}")
            r++
        }

        schoolLines(school).forEach { row(listOf(it to 4), mergeAll = true) }
        row(listOf(doc.title to 1), height = 24, mergeAll = true)
        doc.subtitle?.let { row(listOf(it to 4), mergeAll = true) }
        r++

        for (b in doc.blocks) {
            when (b) {
                is Block.Heading -> row(listOf(b.text to 5), mergeAll = true)
                is Block.Para -> row(listOf(b.text to if (b.bold) 4 else 0), mergeAll = true)
                is Block.Stats -> {
                    // One figure per row (caption, value) so long captions stay readable.
                    val first = if (maxCols >= 3) 1 else 0
                    b.items.forEach { (caption, v, color) ->
                        row(List(first) { "" to 0 } + listOf(caption to 2, v to tintStyle((color and 0x00FFFFFF) or 0x33000000)))
                    }
                    widths[first] = maxOf(widths[first] ?: 6, b.items.maxOf { it.first.length } + 4)
                }
                is Block.Table -> {
                    row(b.headers.map { it to 2 }, height = 30)
                    b.rows.forEachIndexed { ri, cells ->
                        row(cells.mapIndexed { c, v -> v to (b.tint(ri, c)?.let(::tintStyle) ?: 3) })
                    }
                    (b.headers.indices).forEach { c ->
                        val longest = (b.rows.map { it.getOrElse(c) { "" } } + b.headers[c]).maxOf { it.length }
                        widths[c] = maxOf(widths[c] ?: 6, minOf(45, longest + 3))
                    }
                }
            }
            r++
        }

        if (doc.signatures.isNotEmpty()) {
            r++
            // Spread the signatures apart: the first near the right edge, the last near the left.
            val at = doc.signatures.indices.map { i ->
                if (doc.signatures.size == 1 || maxCols < 3) i else 1 + i * (maxCols - 3) / (doc.signatures.size - 1)
            }
            fun spread(text: (Int) -> String, style: Int) =
                row((0..at.last()).map { c -> at.indexOf(c).let { i -> if (i < 0) "" to 0 else text(i) to style } })
            spread({ doc.signatures[it] }, 4)
            spread({ "......................." }, 0)
        }

        val cols = (0 until maxCols).joinToString("") { c ->
            "<col min=\"${c + 1}\" max=\"${c + 1}\" width=\"${widths[c] ?: 12}\" customWidth=\"1\"/>"
        }
        val sheet = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
            "<sheetViews><sheetView workbookViewId=\"0\" rightToLeft=\"1\"/></sheetViews>" +
            "<cols>$cols</cols><sheetData>$rows</sheetData>" +
            (if (merges.isEmpty()) "" else "<mergeCells count=\"${merges.size}\">${merges.joinToString("") { "<mergeCell ref=\"$it\"/>" }}</mergeCells>") +
            "<pageSetup paperSize=\"9\" orientation=\"${if (doc.landscape) "landscape" else "portrait"}\" fitToWidth=\"1\" fitToHeight=\"0\"/>" +
            "</worksheet>"

        val fills = StringBuilder("<fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>")
        fills.append("<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF0B3C5D\"/><bgColor indexed=\"64\"/></patternFill></fill>")
        tints.forEach { fills.append("<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF$it\"/><bgColor indexed=\"64\"/></patternFill></fill>") }
        val center = "<alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/>"
        val xfs = StringBuilder()
        xfs.append("<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>")
        xfs.append("<xf numFmtId=\"0\" fontId=\"3\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyAlignment=\"1\">$center</xf>")
        xfs.append("<xf numFmtId=\"0\" fontId=\"2\" fillId=\"2\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\">$center</xf>")
        xfs.append("<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyBorder=\"1\" applyAlignment=\"1\">$center</xf>")
        xfs.append("<xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/>")
        xfs.append("<xf numFmtId=\"0\" fontId=\"4\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/>")
        tints.indices.forEach {
            xfs.append("<xf numFmtId=\"0\" fontId=\"1\" fillId=\"${3 + it}\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\">$center</xf>")
        }
        val styles = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
            "<fonts count=\"5\">" +
            "<font><sz val=\"11\"/><name val=\"Arial\"/></font>" +
            "<font><b/><sz val=\"11\"/><name val=\"Arial\"/></font>" +
            "<font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Arial\"/></font>" +
            "<font><b/><sz val=\"15\"/><color rgb=\"FF0B3C5D\"/><name val=\"Arial\"/></font>" +
            "<font><b/><sz val=\"12\"/><color rgb=\"FF0B3C5D\"/><name val=\"Arial\"/></font>" +
            "</fonts><fills count=\"${3 + tints.size}\">$fills</fills>" +
            "<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border>" +
            "<border><left style=\"thin\"><color rgb=\"FF7A828C\"/></left><right style=\"thin\"><color rgb=\"FF7A828C\"/></right>" +
            "<top style=\"thin\"><color rgb=\"FF7A828C\"/></top><bottom style=\"thin\"><color rgb=\"FF7A828C\"/></bottom><diagonal/></border></borders>" +
            "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
            "<cellXfs count=\"${6 + tints.size}\">$xfs</cellXfs>" +
            "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>" +
            "</styleSheet>"
        val sheetName = esc(doc.title.replace(Regex("""[\\/?*\[\]:]"""), " ").take(31))
        return zip(
            file(context, doc.fileName, "xlsx"),
            linkedMapOf(
                "[Content_Types].xml" to "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                    "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                    "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                    "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                    "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
                    "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
                    "</Types>",
                "_rels/.rels" to "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
                    "</Relationships>",
                "xl/workbook.xml" to "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" " +
                    "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                    "<bookViews><workbookView/></bookViews><sheets><sheet name=\"$sheetName\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
                "xl/_rels/workbook.xml.rels" to "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
                    "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
                    "</Relationships>",
                "xl/worksheets/sheet1.xml" to sheet,
                "xl/styles.xml" to styles,
            ),
        )
    }

    // ---------- WhatsApp text ----------

    /** The report as a chat message: bold title, figures, then one line per table row. */
    fun text(school: School, doc: ReportDoc): String = buildString {
        appendLine("*${doc.title}*")
        doc.subtitle?.let { appendLine(it) }
        appendLine(school.name)
        for (b in doc.blocks) when (b) {
            is Block.Heading -> {
                appendLine()
                appendLine("*${b.text}*")
            }
            is Block.Para -> appendLine(b.text)
            is Block.Stats -> {
                appendLine()
                b.items.forEach { (caption, value, _) -> appendLine("• $caption: $value") }
            }
            is Block.Table -> {
                appendLine()
                val nameCol = b.headers.indexOf("اسم الطالب")
                for (row in b.rows) {
                    val parts = row.indices.filter { it != nameCol && b.headers[it] != "ت" && row[it].isNotBlank() }
                        .joinToString("، ") { "${b.headers[it]}: ${row[it]}" }
                    if (nameCol >= 0) appendLine("${row.getOrElse(0) { "" }}. ${row[nameCol]} — $parts")
                    else appendLine("• $parts")
                }
            }
        }
        if (doc.signatures.isNotEmpty()) {
            appendLine()
            append("إدارة ${school.name}")
        }
    }.trim()
}
