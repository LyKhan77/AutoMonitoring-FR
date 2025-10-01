> model
 - Model face recognition yang digunakan. Contoh: InsightFace (Buffalo_L).

> detection_threshold
 - Ambang kepercayaan deteksi wajah (0.0–1.0). Semakin tinggi, semakin ketat deteksinya.

> detection_size
 - Resolusi input untuk detektor wajah (W,H). Nilai lebih besar biasanya lebih akurat namun lebih berat.

> recognition_cooldown
 - Jeda (detik) untuk mencegah pengenalan berulang pada orang yang sama dalam waktu dekat (rate limiting per identitas).

> providers
 - Daftar execution providers untuk ONNX runtime (mis. CUDAExecutionProvider, CPUExecutionProvider). Urutan = prioritas.

> fps_target
 - Target FPS proses streaming/AI. Menurunkan nilai mengurangi beban CPU/GPU.

> stream_max_width
 - Lebar maksimum stream/video output. Menyetel ke lebih kecil mengurangi bandwidth dan beban encode.

> jpeg_quality
 - Kualitas kompresi JPEG (1–100). Lebih tinggi = kualitas lebih baik, ukuran file lebih besar.

> annotation_stride
 - Frekuensi anotasi (mis. bounding box, label) pada frame. 3 artinya anotasi setiap 3 frame.

> frame_skip
 - Jika true, sistem boleh melewati frame untuk menjaga real-time saat beban tinggi.

> multi_person
 - Jika true, mendukung deteksi / tracking banyak orang sekaligus.

> recognition_threshold
 - Ambang penerimaan untuk keputusan pengenalan identitas (0.0–1.0). Lebih tinggi = lebih sedikit false positive.

> max_distance_threshold
 - Ambang jarak maksimum (embedding distance) untuk menganggap dua wajah sebagai orang yang sama (bergantung skala model).

> embedding_similarity_threshold
 - Ambang kemiripan embedding (kebalikan dari distance) untuk match; semakin tinggi = lebih ketat.

> tracker_iou_threshold
 - Ambang IoU untuk meng-asosiasikan deteksi antar frame dalam tracker. Lebih tinggi = asosiasi lebih ketat.

> tracker_max_misses
 - Jumlah frame maksimum yang boleh “hilang” sebelum track dianggap berakhir.

> bbox_smoothing_factor
 - Faktor smoothing eksponensial (0–1) untuk menghaluskan pergerakan bounding box; lebih tinggi = lebih halus tapi lag.

> smoothing_window
 - Ukuran jendela smoothing voting median/mean untuk stabilisasi pengenalan/ID.

> smoothing_min_votes
 - Minimum vote dalam jendela smoothing untuk mengkonfirmasi hasil (mis. identitas) agar stabil.

> tracking_timeout
 - Batas waktu (detik) untuk menganggap seseorang sudah “keluar” bila tidak terlihat lagi.

> present_timeout_sec
 - Batas waktu status “presence” (real-time hadir) sebelum dianggap tidak hadir/off jika tidak terlihat.

> alert_min_interval_sec
 - Interval minimal antar pengiriman alert untuk orang yang sama (anti-spam).

> away_mute_threshold_hours
 - Berapa jam “away” (tidak terlihat) sebelum sistem memute alert tertentu atau mengubah perilaku notifikasi.

> mark_absent_enabled
 - Mengaktifkan fitur penandaan otomatis ABSENT pada akhir hari sesuai aturan sistem.

> mark_absent_offset_minutes_before_end
 - Offset menit sebelum jam pulang untuk mulai menandai karyawan yang belum pernah “in” sebagai ABSENT.

> use_gstreamer_rtsp
 - Jika true, gunakan pipeline GStreamer untuk RTSP (opsional, tergantung lingkungan).

> rtsp_protocol
 - Protokol RTSP yang digunakan (tcp atau udp). tcp lebih andal pada jaringan tidak stabil.

> rtsp_codec
 - Codec stream yang diharapkan/diprioritaskan (mis. h264). Berguna untuk tunning pipeline decode.

> gst_latency_ms
- Latency buffer GStreamer (ms). Lebih kecil = latensi rendah, namun berisiko stutter pada jaringan buruk.