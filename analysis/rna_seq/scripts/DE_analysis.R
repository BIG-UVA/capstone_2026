#all DE analysis + the plots are made here. We can split the plots to a new helper function if needed 

library(DESeq2)
library(ggplot2)
library(dplyr)
library(pheatmap)
library(RColorBrewer)

project_dir <- path.expand("~/MSDS/capstone_project")
deseq2_dir  <- file.path(project_dir, "results", "deseq2")
figures_dir <- file.path(project_dir, "figures")
dir.create(deseq2_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(figures_dir, recursive = TRUE, showWarnings = FALSE)
options(bitmapType = "cairo")




# helper functions 


run_deseq <- function(txi, metadata, keep_rows, design_col, ref_level, test_level, label) {
  # Subset metadata and txi
  meta_sub <- metadata[keep_rows, ]
  meta_sub[[design_col]] <- factor(meta_sub[[design_col]], levels = c(ref_level, test_level))
  
  txi_sub <- list(
    counts              = txi$counts[, meta_sub$sample],
    abundance           = txi$abundance[, meta_sub$sample],
    length              = txi$length[, meta_sub$sample],
    countsFromAbundance = txi$countsFromAbundance
  )
  
  # build DESeq2 object
  formula <- as.formula(paste("~", design_col))
  dds <- DESeqDataSetFromTximport(txi_sub, colData = meta_sub, design = formula)
  keep_genes <- rowSums(counts(dds) >= 10) >= 3
  dds <- dds[keep_genes, ]
  
  cat("\n==========", label, "==========\n")
  cat("Samples:", ncol(dds), "| Genes after filtering:", nrow(dds), "\n")
  cat("Groups:", ref_level, "vs", test_level, "\n")
  
  # run DESeq2
  dds <- DESeq(dds)
  
  # extract results
  res <- results(dds, contrast = c(design_col, test_level, ref_level), alpha = 0.05)
  cat("\nResults summary:\n")
  summary(res)
  
  # try LFC shrinkage find the coefficient name
  coef_names <- resultsNames(dds)
  cat("Available coefficients:", paste(coef_names, collapse = ", "), "\n")
  
  coef_name <- coef_names[length(coef_names)]
  
  res_shrunk <- tryCatch({
    lfcShrink(dds, coef = coef_name, type = "apeglm")
  }, error = function(e) {
    cat("Note: apeglm shrinkage failed, using normal results. Error:", e$message, "\n")
    res
  })
  
  # build VST for heatmaps
  vsd <- vst(dds, blind = FALSE)
  
  return(list(dds = dds, res = res, res_shrunk = res_shrunk, vsd = vsd, meta = meta_sub))
}


build_results_table <- function(res, up_label, down_label, res_unshrunk = NULL) {
  res_df <- as.data.frame(res) %>%
    tibble::rownames_to_column("gene_id") %>%
    arrange(padj) %>%
    mutate(
      significant = padj < 0.05 & !is.na(padj),
      direction = case_when(
        !significant        ~ "NS",
        log2FoldChange > 0  ~ up_label,
        log2FoldChange < 0  ~ down_label
      )
    )
  if (!is.null(res_unshrunk)) {
    stat_df <- as.data.frame(res_unshrunk) %>%
      tibble::rownames_to_column("gene_id") %>%
      dplyr::select(gene_id, stat,log2FoldChange_raw = log2FoldChange)
    res_df <- dplyr::left_join(res_df, stat_df, by = "gene_id")
  }
  return(res_df)
}


make_volcano <- function(res_df, up_label, down_label, title, filename) {
  p <- ggplot(res_df, aes(x = log2FoldChange, y = -log10(padj), color = direction)) +
    geom_point(alpha = 0.4, size = 1) +
    scale_color_manual(values = setNames(
      c("#D73027", "#4575B4", "grey70"),
      c(up_label, down_label, "NS")
    )) +
    geom_hline(yintercept = -log10(0.05), linetype = "dashed", color = "grey40") +
    geom_vline(xintercept = c(-1, 1), linetype = "dashed", color = "grey40") +
    xlab(paste("Log2 Fold Change")) +
    ylab("-Log10 Adjusted P-value") +
    ggtitle(title) +
    theme_minimal(base_size = 13) +
    theme(legend.position = "bottom")
  
  print(p)
  ggsave(filename, p, width = 9, height = 7)
  cat("Saved:", basename(filename), "\n")
}


make_ma <- function(res_df, up_label, down_label, title, filename) {
  p <- ggplot(res_df, aes(x = log10(baseMean + 1), y = log2FoldChange, color = direction)) +
    geom_point(alpha = 0.3, size = 0.8) +
    scale_color_manual(values = setNames(
      c("#D73027", "#4575B4", "grey70"),
      c(up_label, down_label, "NS")
    )) +
    geom_hline(yintercept = 0, color = "black", linewidth = 0.5) +
    xlab("Log10 Mean Expression") +
    ylab("Log2 Fold Change") +
    ggtitle(title) +
    theme_minimal(base_size = 13) +
    theme(legend.position = "bottom")
  
  print(p)
  ggsave(filename, p, width = 9, height = 7)
  cat("Saved:", basename(filename), "\n")
}


make_heatmap <- function(res_df, vsd, meta, annot_col_name, top_n, title, filename) {
  top_genes <- res_df %>%
    filter(significant == TRUE) %>%
    arrange(padj) %>%
    head(top_n) %>%
    pull(gene_id)
  
  top_genes <- top_genes[top_genes %in% rownames(assay(vsd))]
  
  if (length(top_genes) < 3) {
    cat("Not enough significant genes for heatmap:", title, "\n")
    return(invisible(NULL))
  }
  
  mat <- assay(vsd)[top_genes, ]
  mat_scaled <- t(scale(t(mat)))
  
  annot <- data.frame(
    Group = meta[[annot_col_name]],
    row.names = meta$sample
  )
  
  pheatmap(
    mat_scaled,
    annotation_col = annot,
    cluster_rows   = TRUE,
    cluster_cols   = TRUE,
    show_rownames  = TRUE,
    show_colnames  = TRUE,
    fontsize_row   = 7,
    fontsize_col   = 9,
    color          = colorRampPalette(c("#4575B4", "white", "#D73027"))(100),
    main           = title,
    filename       = filename,
    width          = 10,
    height         = 14
  )
  cat("Saved:", basename(filename), "\n")
}


# COMPARISON 1: 5xFAD vs WT (Alzheimer's) — GSE212277


# levels match the master table's raw `genotype` values

result_5xfad <- run_deseq(
  txi, metadata,
  keep_rows  = metadata$genotype %in% c("WT (Control)", "5xFAD"),
  design_col = "genotype",
  ref_level  = "WT (Control)",
  test_level = "5xFAD",
  label      = "5xFAD vs WT (Alzheimer's) — GSE212277"
)

res_5xfad_df <- build_results_table(result_5xfad$res_shrunk, "Up in 5xFAD", "Down in 5xFAD",result_5xfad$res)

cat("\nGenes by direction:\n")
print(table(res_5xfad_df$direction, useNA = "ifany"))

write.csv(res_5xfad_df, file.path(deseq2_dir, "de_results_5xFAD_vs_WT.csv"), row.names = FALSE)

make_volcano(res_5xfad_df, "Up in 5xFAD","Down in 5xFAD",
             "Volcano Plot showing 5xFAD vs WT (Alzheimers)",
             file.path(figures_dir, "volcano_5xFAD_vs_WT.png"))

make_ma(res_5xfad_df, "Up in 5xFAD", "Down in 5xFAD",
        "MA Plotshowing 5xFAD vs WT",
        file.path(figures_dir, "ma_plot_5xFAD_vs_WT.png"))

make_heatmap(res_5xfad_df, result_5xfad$vsd, result_5xfad$meta, "genotype", 50,
             "Top 50 DE Genes — 5xFAD vs WT (z-scored)",
             file.path(figures_dir, "heatmap_top50_5xFAD_vs_WT.png"))


# COMPARISON 2: STAT1-KO vs Control — GSE203655


# master table stores these as "WT" / "STAT1_KO" (not "Control" / "STAT1-KO")

result_stat1 <- run_deseq(
  txi, metadata,
  keep_rows  = metadata$dataset == "GSE203655",
  design_col = "genotype",
  ref_level  = "WT",
  test_level = "STAT1_KO",
  label      = "STAT1-KO vs Control — GSE203655"
)

res_stat1_df <- build_results_table(result_stat1$res_shrunk, "Up in STAT1-KO", "Down in STAT1-KO",result_stat1$res)

cat("\nGenes by direction:\n")
print(table(res_stat1_df$direction, useNA = "ifany"))

write.csv(res_stat1_df, file.path(deseq2_dir, "de_results_STAT1KO_vs_Control.csv"), row.names = FALSE)

make_volcano(res_stat1_df, "Up in STAT1-KO", "Down in STAT1-KO",
             "Volcano Plot for STAT1-KO vs Control Microglia(T. gondii)",
             file.path(figures_dir, "volcano_STAT1KO_vs_Control.png"))

make_ma(res_stat1_df, "Up in STAT1-KO", "Down in STAT1-KO",
        "MA Plot — STAT1-KO vs Control",
        file.path(figures_dir, "ma_plot_STAT1KO_vs_Control.png"))

make_heatmap(res_stat1_df, result_stat1$vsd, result_stat1$meta, "genotype", 50,
             "Top 50 DE Genes of STAT1-KO vs Control (z-scored)",
             file.path(figures_dir, "heatmap_top50_STAT1KO_vs_Control.png"))



# COMPARISON 3: Microglia vs Macrophage —GSE146680


result_celltype <- run_deseq(
  txi, metadata,
  keep_rows  = metadata$dataset == "GSE146680",
  design_col = "cell_type",
  ref_level  = "Macrophage",
  test_level = "Microglia",
  label      = "Microglia vs Macrophage — GSE146680"
)

res_celltype_df <- build_results_table(result_celltype$res_shrunk, "Up in Microglia", "Up in Macrophage",result_celltype$res)

cat("\nGenes by direction:\n")
print(table(res_celltype_df$direction, useNA = "ifany"))

write.csv(res_celltype_df, file.path(deseq2_dir, "de_results_Microglia_vs_Macrophage.csv"), row.names = FALSE)

make_volcano(res_celltype_df, "Up in Microglia", "Up in Macrophage",
             "Volcano Plot — Microglia vs Macrophage (T. gondii)",
             file.path(figures_dir, "volcano_Microglia_vs_Macrophage.png"))

make_ma(res_celltype_df, "Up in Microglia", "Up in Macrophage",
        "MA Plot — Microglia vs Macrophage",
        file.path(figures_dir, "ma_plot_Microglia_vs_Macrophage.png"))

make_heatmap(res_celltype_df, result_celltype$vsd, result_celltype$meta, "cell_type", 50,
             "Top 50 DE Genes — Microglia vs Macrophage (z-scored)",
             file.path(figures_dir, "heatmap_top50_Microglia_vs_Macrophage.png"))



# SUMMARY TABLE below 


summary_table <- data.frame(
  Comparison = c(
    "5xFAD vs WT (Alzheimer's)",
    "STAT1-KO vs Control (T. gondii)",
    "Microglia vs Macrophage (T. gondii)"
  ),
  Dataset = c("GSE212277", "GSE203655", "GSE146680"),
  Total_Genes_Tested = c(nrow(res_5xfad_df), nrow(res_stat1_df), nrow(res_celltype_df)),
  Upregulated = c(
    sum(res_5xfad_df$direction == "Up in 5xFAD", na.rm = TRUE),
    sum(res_stat1_df$direction == "Up in STAT1-KO", na.rm = TRUE),
    sum(res_celltype_df$direction == "Up in Microglia", na.rm = TRUE)
  ),
  Downregulated = c(
    sum(res_5xfad_df$direction == "Down in 5xFAD", na.rm = TRUE),
    sum(res_stat1_df$direction == "Down in STAT1-KO", na.rm = TRUE),
    sum(res_celltype_df$direction == "Up in Macrophage", na.rm = TRUE)
  ),
  Not_Significant = c(
    sum(res_5xfad_df$direction == "NS", na.rm = TRUE),
    sum(res_stat1_df$direction == "NS", na.rm = TRUE),
    sum(res_celltype_df$direction == "NS", na.rm = TRUE)
  )
 # LFC_Shrinkage = "apeglm"
)

cat("\n\n========== SUMMARY ==========\n\n")
print(summary_table)
write.csv(summary_table, file.path(deseq2_dir, "de_comparison_summary.csv"), row.names = FALSE)

# save all objects for downstream scripts (pathway enrichment, overlap)
save(result_5xfad, res_5xfad_df,
     result_stat1, res_stat1_df,
     result_celltype, res_celltype_df,
     summary_table,
     file = file.path(deseq2_dir, "all_de_results.RData"))

cat("\n\nDE tables + RData saved to:", deseq2_dir, "\n")
cat("Figures saved to:", figures_dir, "\n")
cat("\nDone!\n")
