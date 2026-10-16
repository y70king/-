package com.hayalnaft.attendance.util

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.hayalnaft.attendance.data.School
import java.io.File

/** Where finished pages go: a PDF file on the phone, or images in tests. */
interface PageSink {
    fun start(width: Int, height: Int, number: Int): Canvas
    fun finish()
    fun write(file: File)
}

class PdfSink : PageSink {
    private val doc = PdfDocument()
    private var page: PdfDocument.Page? = null

    override fun start(width: Int, height: Int, number: Int): Canvas {
        val p = doc.startPage(PdfDocument.PageInfo.Builder(width, height, number).create())
        page = p
        return p.canvas
    }

    override fun finish() {
        page?.let { doc.finishPage(it) }
        page = null
    }

    override fun write(file: File) {
        file.outputStream().use { doc.writeTo(it) }
        doc.close()
    }
}

/** Draws A4 pages with right-to-left Arabic text and simple ruled tables. */
class PdfBuilder(landscape: Boolean = false, private val pageNumbers: Boolean = true) {
    companion object {
        /** Replaced in tests to capture pages as images. */
        var sinkFactory: () -> PageSink = { PdfSink() }

        val NAVY = Color.rgb(11, 60, 93)
        val GOLD = Color.rgb(242, 169, 0)
        val GREEN = Color.rgb(46, 125, 50)
        val RED = Color.rgb(198, 40, 40)
        val LIGHT = Color.rgb(234, 240, 247)
    }

    val pageWidth = if (landscape) 842 else 595
    val pageHeight = if (landscape) 595 else 842
    private val margin = 30f
    val contentWidth = pageWidth - 2 * margin
    private val sink = sinkFactory()
    private var open = false
    lateinit var canvas: Canvas
        private set
    var y = margin
    private var pageNo = 0

    init {
        newPage()
    }

    fun newPage() {
        if (open) sink.finish()
        pageNo++
        canvas = sink.start(pageWidth, pageHeight, pageNo)
        canvas.drawColor(Color.WHITE)
        open = true
        y = margin
        if (!pageNumbers) return
        val paint = paint(8f, color = Color.GRAY)
        canvas.drawText("صفحة $pageNo", pageWidth / 2f - 12, pageHeight - 14f, paint)
    }

    fun paint(size: Float, bold: Boolean = false, color: Int = Color.BLACK) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        this.color = color
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    @Suppress("DEPRECATION")
    fun layout(text: String, p: TextPaint, width: Float, align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL): StaticLayout =
        StaticLayout(text, p, maxOf(1, width.toInt()), align, 1.1f, 0f, false)

    private fun ensure(h: Float) {
        if (y + h > pageHeight - margin - 10) newPage()
    }

    /** A paragraph across the full width; long text continues on the next page. */
    fun text(
        s: String,
        size: Float = 11f,
        bold: Boolean = false,
        color: Int = Color.BLACK,
        align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL,
        gap: Float = 4f,
    ) {
        val l = layout(s, paint(size, bold, color), contentWidth, align)
        for (line in 0 until l.lineCount) {
            val h = (l.getLineBottom(line) - l.getLineTop(line)).toFloat()
            ensure(h)
            canvas.save()
            canvas.clipRect(margin, y, margin + contentWidth, y + h)
            canvas.translate(margin, y - l.getLineTop(line))
            l.draw(canvas)
            canvas.restore()
            y += h
        }
        y += gap
    }

    fun space(h: Float) {
        y += h
    }

    /** A titled band, e.g. a section heading. */
    fun heading(s: String) {
        val l = layout(s, paint(12f, true, Color.WHITE), contentWidth - 16)
        val h = l.height + 8f
        ensure(h + 20)
        canvas.drawRoundRect(RectF(margin, y, margin + contentWidth, y + h), 4f, 4f, Paint().apply { color = NAVY })
        canvas.save()
        canvas.translate(margin + 8, y + 4)
        l.draw(canvas)
        canvas.restore()
        y += h + 6
    }

    /** Official school header: ministry and school on the right, year and shift on the left, title in the middle. */
    fun schoolHeader(school: School, title: String, subtitle: String? = null) {
        val third = contentWidth / 3
        val right = buildString {
            append("جمهورية العراق\nوزارة التربية")
            if (school.directorate.isNotBlank()) append("\nالمديرية العامة للتربية في ${school.directorate}")
            append("\n${school.name}")
        }
        val left = buildString {
            if (school.year.isNotBlank()) append("العام الدراسي: ${school.yearText}\n")
            append("الدوام: ${school.shift}")
        }
        val rl = layout(right, paint(9.5f, true), third)
        val ll = layout(left, paint(9.5f), third, Layout.Alignment.ALIGN_OPPOSITE)
        val tl = layout(title + (subtitle?.let { "\n$it" } ?: ""), paint(14f, true, NAVY), third, Layout.Alignment.ALIGN_CENTER)
        val h = maxOf(rl.height, ll.height, tl.height).toFloat()
        // Right-to-left: the first block sits at the right edge.
        draw(rl, margin + 2 * third, y)
        draw(tl, margin + third, y + (h - tl.height) / 2)
        draw(ll, margin, y)
        y += h + 8
        canvas.drawLine(margin, y, margin + contentWidth, y, Paint().apply { color = GOLD; strokeWidth = 2f })
        y += 10
    }

    fun draw(l: StaticLayout, x: Float, top: Float) {
        canvas.save()
        canvas.translate(x, top)
        l.draw(canvas)
        canvas.restore()
    }

    /**
     * A ruled table. Columns are listed right to left (the first column is drawn at the right edge),
     * sized by [weights]. The header row repeats on every page. [rowColor] may tint a whole row.
     */
    fun table(
        headers: List<String>,
        rows: List<List<String>>,
        weights: List<Float>,
        size: Float = 9.5f,
        rowColor: (Int) -> Int? = { null },
        cellColor: (row: Int, col: Int) -> Int? = { _, _ -> null },
    ) {
        val total = weights.sum()
        val widths = weights.map { it / total * contentWidth }
        val border = Paint().apply { color = Color.rgb(120, 130, 140); style = Paint.Style.STROKE; strokeWidth = 0.6f }
        val fill = Paint()

        fun rowHeight(cells: List<String>, p: TextPaint) =
            cells.mapIndexed { i, c -> layout(c, p, widths[i] - 6, Layout.Alignment.ALIGN_CENTER).height }.maxOrNull()!!.toFloat() + 8

        fun drawRow(cells: List<String>, p: TextPaint, bg: Int?, colors: (Int) -> Int?) {
            val h = rowHeight(cells, p)
            var x = margin + contentWidth
            cells.forEachIndexed { i, c ->
                val w = widths[i]
                x -= w
                val rect = RectF(x, y, x + w, y + h)
                (colors(i) ?: bg)?.let { fill.color = it; canvas.drawRect(rect, fill) }
                canvas.drawRect(rect, border)
                val l = layout(c, p, w - 6, Layout.Alignment.ALIGN_CENTER)
                draw(l, x + 3, y + (h - l.height) / 2)
            }
            y += h
        }

        val headPaint = paint(size, true, Color.WHITE)
        val bodyPaint = paint(size)
        fun header() = drawRow(headers, headPaint, NAVY) { null }
        ensure(rowHeight(headers, headPaint) * 2)
        header()
        rows.forEachIndexed { r, cells ->
            val h = rowHeight(cells, bodyPaint)
            if (y + h > pageHeight - margin - 10) {
                newPage()
                header()
            }
            val bg = rowColor(r) ?: if (r % 2 == 1) LIGHT else null
            drawRow(cells, bodyPaint, bg) { c -> cellColor(r, c) }
        }
        y += 8
    }

    /** Signature lines, right to left. */
    fun signatures(vararg titles: String) {
        ensure(60f)
        y += 20
        val w = contentWidth / titles.size
        titles.forEachIndexed { i, t ->
            val x = margin + contentWidth - (i + 1) * w
            val l = layout("$t\n\n.........................", paint(10f, true), w, Layout.Alignment.ALIGN_CENTER)
            draw(l, x, y)
        }
        y += 50
    }

    fun save(file: File): File {
        if (open) sink.finish()
        open = false
        file.parentFile?.mkdirs()
        sink.write(file)
        return file
    }
}

object PdfFiles {
    fun file(context: Context, name: String): File {
        val safe = name.replace(Regex("""[\\/:*?"<>|]"""), "-")
        return File(File(context.cacheDir, "reports"), "$safe.pdf")
    }

    /** Opens the system print dialog for a PDF (print to paper or "Save as PDF"). */
    fun print(context: Context, file: File, jobName: String) {
        val pm = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
        pm.print(jobName, object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?, newAttributes: PrintAttributes?, cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback, extras: Bundle?,
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback.onLayoutCancelled()
                    return
                }
                callback.onLayoutFinished(
                    PrintDocumentInfo.Builder(file.name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(),
                    true,
                )
            }

            override fun onWrite(
                pages: Array<out PageRange>?, destination: ParcelFileDescriptor, cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback,
            ) {
                try {
                    file.inputStream().use { input ->
                        ParcelFileDescriptor.AutoCloseOutputStream(destination).use { input.copyTo(it) }
                    }
                    callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                } catch (e: Exception) {
                    callback.onWriteFailed(e.message)
                }
            }
        }, null)
    }
}
