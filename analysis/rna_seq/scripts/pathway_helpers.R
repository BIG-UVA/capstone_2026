# fGSEA pathway analysis on DESeq2 results.
# Writes TWO things per dataset:
#   1. a combined <label>.gsea_results.csv (all collections, for consistency/report)
#   2. loader-format files: fgsea_<METHOD>_<GSE>.csv  (one per collection per dataset)
# Ranking uses the DESeq2 Wald `stat` (matches the sponsor's workflow).

library(msigdbr)
library(dplyr)
library(fgsea)
library(openxlsx)


project_dir <- path.expand("~/MSDS/capstone_project")
deseq2_dir  <- file.path(project_dir, "results", "deseq2")
out_dir     <- file.path(project_dir, "results", "pathway")
species     <- "Mus musculus"
min_size    <- 15
max_size    <- 500

comparisons <- list(
  list(label ="5xFAD_vs_WT",             gse ="GSE212277",file ="de_results_5xFAD_vs_WT.csv"),
  list(label ="STAT1KO_vs_Control",      gse ="GSE203655",file ="de_results_STAT1KO_vs_Control.csv"),
  list(label ="Microglia_vs_Macrophage", gse ="GSE146680",file ="de_results_Microglia_vs_Macrophage.csv"))


method_map <- c(hallmark = "HALLMARK", kegg = "KEGG", reactome = "REACTOME",
                wikipathways = "WIKIPATHWAYS", gobp = "GO_BP", gomf = "GO_MF")



dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

collections <- list(
  hallmark     = list(collection = "H"),
  kegg         = list(collection = "C2", subcollection = "CP:KEGG_LEGACY"),
  reactome     = list(collection = "C2", subcollection = "CP:REACTOME"),
  wikipathways = list(collection = "C2", subcollection = "CP:WIKIPATHWAYS"),
  gobp         = list(collection = "C5", subcollection = "GO:BP"),
  gomf         = list(collection = "C5", subcollection = "GO:MF")
)

detect_gene_col <- function(ids) {
  if (mean(grepl("^ENSMUSG", ids)) > 0.5) "ensembl_gene" else "gene_symbol"
}

build_gene_sets <- function(gene_col) {
  lapply(collections, function(args) {
    df <- do.call(msigdbr, c(list(species = species), args))
    split(df[[gene_col]], df$gs_name)
  })
}


rank_genes <- function(res) {
  res     <- res %>% filter(!is.na(stat), !is.infinite(stat))
  gene_id <- gsub("\\.[0-9]+$", "", res$gene_id)
  ranks   <- setNames(res$stat, gene_id)
  sort(ranks, decreasing = TRUE)
}

flatten_le <- function(df) { df$leadingEdge <- sapply(df$leadingEdge, paste, collapse = ","); df }

for (cmp in comparisons) {
  message("\n=== ", cmp$label, " (", cmp$gse, ") ===")
  res   <- read.csv(file.path(deseq2_dir, cmp$file))
  ranks <- rank_genes(res)
  
  gene_col  <- detect_gene_col(names(ranks))
  gene_sets <- build_gene_sets(gene_col)
  
  gsea <- lapply(names(gene_sets), function(gs) {
    message("  ", gs)
    r <- fgsea(pathways = gene_sets[[gs]], stats = ranks,
               minSize = min_size, maxSize = max_size,nproc=1)
    flatten_le(r[order(r$pval), ])
  })
  names(gsea) <- names(gene_sets)
  
  combined <- bind_rows(gsea, .id = "collection")
  write.csv(combined, file.path(out_dir, paste0(cmp$label, ".gsea_results.csv")),
            row.names = FALSE)
  saveRDS(gsea, file.path(out_dir, paste0(cmp$label, ".gsea_results.rds")))
  
  # one file for each dataset 
  for (gs in names(gsea)) {
    write.csv(gsea[[gs]],
              file.path(out_dir, paste0("fgsea_", method_map[[gs]], "_", cmp$gse, ".csv")),
              row.names = FALSE)
  }
}

message("\ncombined +fgsea_<METHOD>_<GSE>.csv files to ", out_dir)